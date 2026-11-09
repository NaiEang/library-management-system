import { createHash } from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { RoleName } from '../../common/constants';
import { AuthConfig } from '../config/auth.config';
import { RefreshToken } from '../entities/refresh-token.entity';
import { hashRefreshToken, RefreshTokenService } from './refresh-token.service';

const HOUR = 3600;
const DAY = 24 * HOUR;
const config = {
  refreshIdleTtlSeconds: 7 * DAY,
  refreshAbsoluteTtlMemberSeconds: 30 * DAY,
  refreshAbsoluteTtlStaffSeconds: 12 * HOUR,
} as AuthConfig;

function setup() {
  const insert = vi.fn(() => Promise.resolve({}));
  const service = new RefreshTokenService(
    { insert } as unknown as Repository<RefreshToken>,
    config,
  );
  const stored = () =>
    (insert.mock.calls[0] as unknown as [Partial<RefreshToken>])[0];
  return { service, insert, stored };
}

describe('RefreshTokenService.issue', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-04T08:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('returns 32 random bytes (base64url) and stores only their SHA-256 hash', async () => {
    const { service, stored } = setup();
    const { token } = await service.issue({
      userId: '3',
      role: RoleName.MEMBER,
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(stored().tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(JSON.stringify(stored())).not.toContain(token);
  });

  it('never issues the same token twice', async () => {
    const { service } = setup();
    const tokens = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.issue({ userId: '3', role: RoleName.MEMBER }),
      ),
    );
    expect(new Set(tokens.map((t) => t.token)).size).toBe(20);
  });

  it('members: idle expiry in 7 days, absolute in 30 days', async () => {
    const { service, stored } = setup();
    const { expiresAt } = await service.issue({
      userId: '3',
      role: RoleName.MEMBER,
    });
    const now = Date.now();
    expect(expiresAt.getTime() - now).toBe(7 * DAY * 1000);
    expect(stored().absoluteExpiresAt!.getTime() - now).toBe(30 * DAY * 1000);
  });

  it.each([RoleName.LIBRARIAN, RoleName.ADMIN])(
    '%s: both limits capped at 12 hours',
    async (role) => {
      const { service, stored } = setup();
      const { expiresAt } = await service.issue({ userId: '2', role });
      expect(expiresAt.getTime() - Date.now()).toBe(12 * HOUR * 1000);
      expect(stored().absoluteExpiresAt!.getTime()).toBe(expiresAt.getTime());
    },
  );

  it('starts a new family per login and records the client, truncated to the column sizes', async () => {
    const { service, stored } = setup();
    await service.issue({
      userId: '3',
      role: RoleName.MEMBER,
      ip: '1'.repeat(60),
      userAgent: 'a'.repeat(300),
    });
    expect(stored().familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(stored().ipAddress).toHaveLength(45);
    expect(stored().userAgent).toHaveLength(255);
  });

  it('hashRefreshToken is SHA-256 hex', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('RefreshTokenService.revokeAllForUser', () => {
  it("revokes only the user's sessions that are still active, and can join a transaction", async () => {
    const update = vi.fn(() => Promise.resolve({ affected: 2 }));
    const service = new RefreshTokenService(
      { manager: { update: vi.fn() } } as unknown as Repository<RefreshToken>,
      config,
    );
    const transactionManager = { update } as unknown as EntityManager;
    await expect(
      service.revokeAllForUser('3', transactionManager),
    ).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith(
      RefreshToken,
      { userId: '3', revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });
});
