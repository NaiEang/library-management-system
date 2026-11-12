import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthConfig } from '../auth/config/auth.config';
import { Member } from './entities/member.entity';
import {
  EMAIL_NOT_VERIFIED,
  escapeLike,
  MembersService,
} from './members.service';

const config = {
  libraryTimeZone: 'Asia/Phnom_Penh',
  depositAmount: 5,
} as AuthConfig;

const pendingMember = () => ({
  id: '30',
  userId: '3',
  memberCode: 'LF-2026-ABCDEF',
  membershipStatus: 'pending_deposit',
  membershipDate: '2026-11-01',
  expiryDate: null,
  depositAmount: '0.00',
  depositVerifiedAt: null,
  depositVerifiedBy: null,
});

const activeUser = {
  id: '3',
  email: 'member@demo.test',
  username: 'member',
  status: 'active',
  emailVerifiedAt: new Date('2026-11-08T09:00:00Z'),
};

// Plain objects shaped like the rows the database returns.
function setup(
  member: Record<string, unknown> | null,
  user: Record<string, unknown> | null = activeUser,
  affected = 1,
) {
  const lockedQuery = {
    setLock: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn(() => Promise.resolve(member)),
  };
  const manager = {
    createQueryBuilder: vi.fn(() => lockedQuery),
    findOne: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve({ affected })),
  };
  const transaction = vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
    work(manager),
  );
  const service = new MembersService(
    { manager: { transaction } } as unknown as Repository<Member>,
    config,
  );
  return { service, manager, lockedQuery, transaction };
}

describe('MembersService.verifyDeposit', () => {
  afterEach(() => vi.useRealTimers());

  it('activates the membership: deposit from config, who and when, expiry = library date + 1 year', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T05:00:00Z') });
    const { service, manager, lockedQuery } = setup(pendingMember());
    const result = await service.verifyDeposit('3', '2');

    expect(lockedQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(manager.update).toHaveBeenCalledWith(
      Member,
      { id: '30', membershipStatus: 'pending_deposit' },
      {
        depositAmount: 5,
        membershipStatus: 'active',
        depositVerifiedAt: new Date('2026-11-09T05:00:00Z'),
        depositVerifiedBy: '2',
        expiryDate: '2027-11-09',
      },
    );
    expect(result).toMatchObject({
      userId: '3',
      memberId: '30',
      membershipStatus: 'active',
      emailVerified: true,
      depositAmount: 5,
      expiryDate: '2027-11-09',
    });
    expect(result).not.toHaveProperty('blockedUntil');
  });

  it('uses the Phnom Penh date: 18:00 UTC on Nov 9 is already Nov 10 at the library', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T18:00:00Z') });
    const { service, manager } = setup(pendingMember());
    await service.verifyDeposit('3', '2');
    expect((manager.update.mock.calls[0] as unknown[])[2]).toMatchObject({
      expiryDate: '2027-11-10',
    });
  });

  it('a member who is not waiting for a deposit → 409, nothing written', async () => {
    const { service, manager } = setup({
      ...pendingMember(),
      membershipStatus: 'active',
    });
    await expect(service.verifyDeposit('3', '2')).rejects.toThrow(
      ConflictException,
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('if another staff member activated it in between, the conditional update changes nothing → 409', async () => {
    const { service } = setup(pendingMember(), activeUser, 0);
    await expect(service.verifyDeposit('3', '2')).rejects.toThrow(
      /already verified/,
    );
  });

  it('a disabled account → 409, nothing written', async () => {
    const { service, manager } = setup(pendingMember(), {
      ...activeUser,
      status: 'disabled',
    });
    await expect(service.verifyDeposit('3', '2')).rejects.toThrow(
      'This account is disabled',
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('an unverified email → 409, nothing written', async () => {
    const { service, manager } = setup(pendingMember(), {
      ...activeUser,
      emailVerifiedAt: null,
    });
    await expect(service.verifyDeposit('3', '2')).rejects.toThrow(
      new ConflictException(EMAIL_NOT_VERIFIED),
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('a user who is not a member (e.g. a librarian) → 404', async () => {
    const { service } = setup(null);
    await expect(service.verifyDeposit('2', '1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('escapeLike', () => {
  it.each([
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['plain', 'plain'],
  ])('%s → %s', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('MembersService.list: the tier filter', () => {
  // 2026-11-12 in Phnom Penh.
  afterEach(() => vi.useRealTimers());

  async function runList(query: Record<string, unknown>) {
    vi.useFakeTimers({ now: new Date('2026-11-12T03:00:00Z') });
    const builder = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn(() =>
        Promise.resolve([
          [
            {
              ...pendingMember(),
              goldUntil: '2026-11-12',
              user: activeUser,
            },
            {
              ...pendingMember(),
              id: '31',
              goldUntil: '2026-11-11',
              user: activeUser,
            },
            { ...pendingMember(), id: '32', goldUntil: null, user: activeUser },
          ],
          3,
        ]),
      ),
    };
    const service = new MembersService(
      {
        createQueryBuilder: vi.fn(() => builder),
      } as unknown as Repository<Member>,
      config,
    );
    const page = await service.list({
      page: 1,
      limit: 20,
      ...query,
    } as never);
    return { page, builder };
  }

  it('gold: only gold periods that have not ended, with the date as a bound parameter', async () => {
    const { builder } = await runList({ tier: 'gold' });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'member.goldUntil >= :today',
      {
        today: '2026-11-12',
      },
    );
  });

  it('standard: never gold, or gold that ended', async () => {
    const { builder } = await runList({ tier: 'standard' });
    expect(builder.andWhere).toHaveBeenCalledWith(
      '(member.goldUntil IS NULL OR member.goldUntil < :today)',
      { today: '2026-11-12' },
    );
  });

  it('adds no tier condition when the filter is absent', async () => {
    const { builder } = await runList({});
    expect(builder.andWhere).not.toHaveBeenCalled();
  });

  it('shows tier and goldUntil on each row, worked out from the date', async () => {
    const { page } = await runList({});
    expect(
      page.data.map((row) => [row.memberId, row.tier, row.goldUntil]),
    ).toEqual([
      ['30', 'gold', '2026-11-12'],
      ['31', 'standard', '2026-11-11'],
      ['32', 'standard', null],
    ]);
  });
});
