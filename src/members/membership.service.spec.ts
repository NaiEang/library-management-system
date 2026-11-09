import { Repository } from 'typeorm';
import { AuthConfig } from '../auth/config/auth.config';
import { Member } from './entities/member.entity';
import { MembershipService } from './membership.service';

const config = { libraryTimeZone: 'Asia/Phnom_Penh' } as AuthConfig;

const eligible = {
  id: '30',
  membershipStatus: 'active',
  expiryDate: '2026-11-04',
  user: { id: '3', status: 'active' },
};

function serviceReturning(member: unknown) {
  const findOne = vi.fn(() => Promise.resolve(member));
  const service = new MembershipService(
    { findOne } as unknown as Repository<Member>,
    config,
  );
  return { service, findOne };
}

describe('MembershipService.canBorrow', () => {
  afterEach(() => vi.useRealTimers());
  const at = (iso: string) => vi.useFakeTimers({ now: new Date(iso) });

  it('allows an active account with an active, unexpired membership', async () => {
    at('2026-10-01T03:00:00Z');
    await expect(
      serviceReturning(eligible).service.canBorrow('30'),
    ).resolves.toBe(true);
  });

  it.each([
    [
      'the account is disabled',
      { ...eligible, user: { id: '3', status: 'disabled' } },
    ],
    [
      'the deposit is not verified yet',
      { ...eligible, membershipStatus: 'pending_deposit', expiryDate: null },
    ],
    [
      'the membership is expired (status)',
      { ...eligible, membershipStatus: 'expired' },
    ],
    ['the expiry date has passed', { ...eligible, expiryDate: '2026-09-30' }],
    [
      'an active membership has no expiry date (bad data)',
      { ...eligible, expiryDate: null },
    ],
    ['the member row has no user', { ...eligible, user: null }],
    ['the member does not exist', null],
  ])('refuses when %s', async (_label, member) => {
    at('2026-10-01T03:00:00Z');
    await expect(
      serviceReturning(member).service.canBorrow('30'),
    ).resolves.toBe(false);
  });

  describe('day boundary: expiry date 2026-11-04, library in Asia/Phnom_Penh (UTC+7)', () => {
    it('still allowed at 23:59:59 Phnom Penh time on the expiry day (16:59:59 UTC)', async () => {
      at('2026-11-04T16:59:59Z');
      await expect(
        serviceReturning(eligible).service.canBorrow('30'),
      ).resolves.toBe(true);
    });

    it('refused from 00:00 Phnom Penh time the next day (17:00 UTC), although UTC still says Nov 4', async () => {
      at('2026-11-04T17:00:00Z');
      await expect(
        serviceReturning(eligible).service.canBorrow('30'),
      ).resolves.toBe(false);
    });

    it('allowed early on the expiry day in Phnom Penh, while UTC is still the day before', async () => {
      at('2026-11-03T17:30:00Z');
      await expect(
        serviceReturning(eligible).service.canBorrow('30'),
      ).resolves.toBe(true);
    });
  });

  it.each(['', 'abc', '30 OR 1=1', '-1'])(
    'refuses a malformed member id (%s) without querying',
    async (id) => {
      const { service, findOne } = serviceReturning(eligible);
      await expect(service.canBorrow(id)).resolves.toBe(false);
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it('does not look at blocked_until: that check belongs to Circulation', async () => {
    at('2026-10-01T03:00:00Z');
    const blocked = {
      ...eligible,
      blockedUntil: new Date('2027-01-01T00:00:00Z'),
    };
    const { service, findOne } = serviceReturning(blocked);
    await expect(service.canBorrow('30')).resolves.toBe(true);
    const options = (
      findOne.mock.calls[0] as unknown as [{ select: Record<string, unknown> }]
    )[0];
    expect(options.select.blockedUntil).toBeUndefined();
  });
});
