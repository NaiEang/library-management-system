import { User } from '../entities/user.entity';

// The member part as the members entity is today. Deposit verification fields
// arrive when the members table changes (feature 7).
export interface MemberSummary {
  id: string;
  memberCode: string;
  membershipStatus: string;
  membershipDate: string;
  expiryDate: string | null;
  depositAmount: number;
}

export interface UserProfileResponse {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  member: MemberSummary | null;
}

// Builds the response field by field, so nothing else on the entity (like the
// password hash) can leak into it.
export function toUserProfile(user: User): UserProfileResponse {
  const member = user.member;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    phone: user.phone ?? null,
    role: user.role.name,
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? null,
    member: member
      ? {
          id: member.id,
          memberCode: member.memberCode,
          membershipStatus: member.membershipStatus,
          membershipDate: member.membershipDate,
          expiryDate: member.expiryDate ?? null,
          // Postgres decimals arrive as strings.
          depositAmount: Number(member.depositAmount),
        }
      : null,
  };
}
