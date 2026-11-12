import { User } from '../entities/user.entity';
import { toUserProfile } from './user-profile.mapper';

const TODAY = '2026-11-12';

const base = {
  id: '3',
  email: 'good.student@demo.com',
  username: 'goodstudent',
  passwordHash: '$argon2id$secret',
  firstName: 'Good',
  lastName: 'Student',
  phone: null,
  status: 'active',
  lastLoginAt: null,
  roleId: 3,
  role: { id: 3, name: 'member' },
  member: {
    id: '30',
    memberCode: 'LF-2026-ABC123',
    membershipStatus: 'pending_deposit',
    membershipDate: '2026-11-01',
    expiryDate: null,
    depositAmount: '5.00',
    depositVerifiedAt: null,
    goldUntil: null,
    blockedUntil: new Date('2027-01-01T00:00:00Z'),
  },
};

describe('toUserProfile', () => {
  it('never includes the password hash, even when the entity has it loaded', () => {
    const profile = toUserProfile(base as unknown as User, TODAY);
    expect(JSON.stringify(profile)).not.toMatch(/passwordHash|argon2|roleId/);
  });

  it('returns the member part with the decimal as a number, and never blocked_until', () => {
    expect(toUserProfile(base as unknown as User, TODAY).member).toEqual({
      id: '30',
      memberCode: 'LF-2026-ABC123',
      membershipStatus: 'pending_deposit',
      membershipDate: '2026-11-01',
      expiryDate: null,
      depositAmount: 5,
      depositVerifiedAt: null,
      tier: 'standard',
      goldUntil: null,
    });
  });

  it('passes the membership status through as stored (no "blocked" assumptions)', () => {
    const user = {
      ...base,
      member: { ...base.member, membershipStatus: 'expired' },
    };
    expect(
      toUserProfile(user as unknown as User, TODAY).member?.membershipStatus,
    ).toBe('expired');
  });

  it('returns member: null for staff', () => {
    const staff = { ...base, role: { id: 2, name: 'librarian' }, member: null };
    expect(toUserProfile(staff as unknown as User, TODAY)).toMatchObject({
      role: 'librarian',
      member: null,
    });
  });

  describe('gold tier, worked out from gold_until and the library date', () => {
    const withGold = (goldUntil: string | null) =>
      toUserProfile(
        { ...base, member: { ...base.member, goldUntil } } as unknown as User,
        TODAY,
      ).member;

    it.each([
      ['gold until a future date', '2027-03-01', 'gold'],
      ['gold until today (still gold through that day)', TODAY, 'gold'],
      ['gold that ended yesterday', '2026-11-11', 'standard'],
      ['never gold', null, 'standard'],
    ])('%s → %s', (_label, goldUntil, tier) => {
      expect(withGold(goldUntil)).toMatchObject({ tier, goldUntil });
    });
  });
});
