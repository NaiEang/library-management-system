import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthConfig } from '../auth/config/auth.config';
import { Payment } from '../payments/entities/payment.entity';
import { Member } from './entities/member.entity';
import {
  GOLD_PAYMENT_TYPE,
  GoldMembershipService,
  GoldPaymentMethod,
} from './gold-membership.service';
import { EMAIL_NOT_VERIFIED } from './members.service';

const config = {
  libraryTimeZone: 'Asia/Phnom_Penh',
  goldMembershipFee: 5,
} as AuthConfig;

// 2026-11-12 10:00 in Phnom Penh.
const NOW = new Date('2026-11-12T03:00:00Z');

const activeMember = (overrides: Record<string, unknown> = {}) => ({
  id: '30',
  userId: '3',
  memberCode: 'LF-2026-ABCDEF',
  membershipStatus: 'active',
  membershipDate: '2026-11-01',
  expiryDate: '2027-11-01',
  depositAmount: '5.00',
  goldUntil: null,
  ...overrides,
});

const verifiedUser = (overrides: Record<string, unknown> = {}) => ({
  id: '3',
  status: 'active',
  emailVerifiedAt: new Date('2026-11-02T00:00:00Z'),
  ...overrides,
});

function setup(
  member: Record<string, unknown> | null = activeMember(),
  user: Record<string, unknown> | null = verifiedUser(),
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
    insert: vi.fn(() => Promise.resolve({ identifiers: [{ id: '700' }] })),
  };
  const transaction = vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
    work(manager),
  );
  const service = new GoldMembershipService(
    { manager: { transaction } } as unknown as Repository<Member>,
    config,
  );
  return { service, manager, lockedQuery, transaction };
}

const insertedPayment = (manager: ReturnType<typeof setup>['manager']) =>
  (manager.insert.mock.calls as unknown as [unknown, Record<string, unknown>][])
    .filter(([entity]) => entity === Payment)
    .map(([, values]) => values);

describe('GoldMembershipService.buyGold', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it('upgrades a standard member for one year and records the fee as a payment, with the row locked', async () => {
    const { service, manager, lockedQuery } = setup();
    const result = await service.buyGold('3', GoldPaymentMethod.CASH);

    expect(lockedQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(manager.update).toHaveBeenCalledWith(
      Member,
      { id: '30', goldUntil: expect.anything() },
      { goldUntil: '2027-11-12' },
    );
    expect(insertedPayment(manager)).toEqual([
      {
        memberId: '30',
        paymentCode: expect.stringMatching(/^GOLD-2026-[A-Z2-7]{8}$/),
        amount: 5,
        paymentMethod: 'cash',
        paymentType: GOLD_PAYMENT_TYPE,
        status: 'completed',
        notes: 'Gold membership until 2027-11-12',
      },
    ]);
    expect(result).toEqual({
      userId: '3',
      memberId: '30',
      memberCode: 'LF-2026-ABCDEF',
      tier: 'gold',
      goldUntil: '2027-11-12',
      renewed: false,
      payment: {
        paymentCode: expect.stringMatching(/^GOLD-2026-/),
        amount: 5,
        paymentMethod: 'cash',
        paymentType: 'gold_membership',
      },
    });
  });

  it('uses the library date: 18:00 UTC on Nov 12 is already Nov 13 in Phnom Penh', async () => {
    vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
    const { service } = setup();
    const result = await service.buyGold('3', GoldPaymentMethod.CASH);
    expect(result.goldUntil).toBe('2027-11-13');
  });

  it('renews in the last 30 days: +1 year from the current end, no day lost', async () => {
    const { service, manager } = setup(
      activeMember({ goldUntil: '2026-12-01' }),
    );
    const result = await service.buyGold('3', GoldPaymentMethod.KHQR);
    expect(result).toMatchObject({ goldUntil: '2027-12-01', renewed: true });
    expect(manager.update).toHaveBeenCalledWith(
      Member,
      { id: '30', goldUntil: '2026-12-01' },
      { goldUntil: '2027-12-01' },
    );
    expect(insertedPayment(manager)[0]).toMatchObject({
      paymentMethod: 'khqr',
    });
  });

  it('renewing on the last day of gold still extends from that day', async () => {
    const { service } = setup(activeMember({ goldUntil: '2026-11-12' }));
    const result = await service.buyGold('3', GoldPaymentMethod.CASH);
    expect(result).toMatchObject({ goldUntil: '2027-11-12', renewed: true });
  });

  it('after gold ended, a new year starts today', async () => {
    const { service } = setup(activeMember({ goldUntil: '2026-11-11' }));
    const result = await service.buyGold('3', GoldPaymentMethod.CASH);
    expect(result).toMatchObject({ goldUntil: '2027-11-12', renewed: false });
  });

  it('refuses a renewal more than 30 days before the end (and a double click) → 409, nothing charged', async () => {
    const { service, manager } = setup(
      activeMember({ goldUntil: '2026-12-13' }),
    );
    await expect(service.buyGold('3', GoldPaymentMethod.CASH)).rejects.toThrow(
      /Already gold until 2026-12-13/,
    );
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('accepts a renewal exactly 30 days before the end', async () => {
    const { service } = setup(activeMember({ goldUntil: '2026-12-12' }));
    await expect(
      service.buyGold('3', GoldPaymentMethod.CASH),
    ).resolves.toMatchObject({ goldUntil: '2027-12-12' });
  });

  it.each([
    [
      'a disabled account',
      activeMember(),
      verifiedUser({ status: 'disabled' }),
      /disabled/,
    ],
    [
      'a pending deposit',
      activeMember({ membershipStatus: 'pending_deposit', expiryDate: null }),
      verifiedUser(),
      /verify the deposit first/,
    ],
    [
      'an expired membership status',
      activeMember({ membershipStatus: 'expired' }),
      verifiedUser(),
      /verify the deposit first/,
    ],
    [
      'a membership past its expiry date',
      activeMember({ expiryDate: '2026-11-11' }),
      verifiedUser(),
      /expired/,
    ],
    [
      'an active membership without an expiry date (bad data)',
      activeMember({ expiryDate: null }),
      verifiedUser(),
      /expired/,
    ],
    [
      'no deposit held',
      activeMember({ depositAmount: '0.00' }),
      verifiedUser(),
      /No deposit/,
    ],
    [
      'an unverified email',
      activeMember(),
      verifiedUser({ emailVerifiedAt: null }),
      EMAIL_NOT_VERIFIED,
    ],
  ])('%s → 409, nothing written', async (_label, member, user, message) => {
    const { service, manager } = setup(member, user);
    const error = await service
      .buyGold('3', GoldPaymentMethod.CASH)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toMatch(message);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('a user who is not a member → 404', async () => {
    const { service } = setup(null);
    await expect(service.buyGold('2', GoldPaymentMethod.CASH)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('if gold changed in between, the conditional update changes nothing → 409, no payment', async () => {
    const { service, manager } = setup(activeMember(), verifiedUser(), 0);
    await expect(service.buyGold('3', GoldPaymentMethod.CASH)).rejects.toThrow(
      /changed in the meantime/,
    );
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('retries with a new payment code when the random code collides', async () => {
    const { service, manager, transaction } = setup();
    const collision = new QueryFailedError('INSERT', [], {
      code: '23505',
      detail: 'Key (payment_code)=(GOLD-2026-AAAAAAAA) already exists.',
    } as unknown as Error);
    manager.insert.mockRejectedValueOnce(collision);
    await expect(
      service.buyGold('3', GoldPaymentMethod.CASH),
    ).resolves.toMatchObject({ goldUntil: '2027-11-12' });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry other database errors', async () => {
    const { service, manager, transaction } = setup();
    manager.insert.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.buyGold('3', GoldPaymentMethod.CASH)).rejects.toThrow(
      'connection lost',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
