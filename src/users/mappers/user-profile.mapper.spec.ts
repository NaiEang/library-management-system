import { User } from '../entities/user.entity';
import { toUserProfile } from './user-profile.mapper';

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
  role: { id: 3, name: 'MEMBER' },
  member: {
    id: '30',
    memberCode: 'LF-2026-ABC123',
    membershipStatus: 'pending_deposit',
    membershipDate: '2026-11-01',
    expiryDate: null,
    depositAmount: '5.00',
  },
};

describe('toUserProfile', () => {
  it('never includes the password hash, even when the entity has it loaded', () => {
    const profile = toUserProfile(base as unknown as User);
    expect(JSON.stringify(profile)).not.toMatch(/passwordHash|argon2|roleId/);
  });

  it('returns the member part as the entity is today, with the decimal as a number', () => {
    expect(toUserProfile(base as unknown as User).member).toEqual({
      id: '30',
      memberCode: 'LF-2026-ABC123',
      membershipStatus: 'pending_deposit',
      membershipDate: '2026-11-01',
      expiryDate: null,
      depositAmount: 5,
    });
  });

  it('passes the membership status through as stored (no "blocked" assumptions)', () => {
    const user = {
      ...base,
      member: { ...base.member, membershipStatus: 'expired' },
    };
    expect(
      toUserProfile(user as unknown as User).member?.membershipStatus,
    ).toBe('expired');
  });

  it('returns member: null for staff', () => {
    const staff = { ...base, role: { id: 2, name: 'LIBRARIAN' }, member: null };
    expect(toUserProfile(staff as unknown as User)).toMatchObject({
      role: 'LIBRARIAN',
      member: null,
    });
  });
});
