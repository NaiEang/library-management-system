import { MembershipTier } from '../../common/constants';
import { tierOf } from '../../members/library-date';
import { User } from '../entities/user.entity';

// blocked_until is deliberately absent: "blocked" belongs to Circulation.
export interface MemberSummary {
  id: string;
  memberCode: string;
  membershipStatus: string;
  membershipDate: string;
  expiryDate: string | null;
  depositAmount: number;
  depositVerifiedAt: Date | null;
  // 'gold' while goldUntil hasn't passed, worked out from the date alone. For
  // display; teammates protect gold features with @GoldMember() / isGold().
  tier: MembershipTier;
  // Last day of the paid gold period (library date); null = never gold.
  goldUntil: string | null;
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
  // false until a member enters the code from their email; staff are true.
  emailVerified: boolean;
  lastLoginAt: Date | null;
  member: MemberSummary | null;
}

// Builds the response field by field, so nothing else on the entity (like the
// password hash) can leak into it.
// today is the library's calendar date (libraryToday), for the gold tier.
export function toUserProfile(user: User, today: string): UserProfileResponse {
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
    emailVerified: user.emailVerifiedAt != null,
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
          depositVerifiedAt: member.depositVerifiedAt ?? null,
          tier: tierOf(member.goldUntil ?? null, today),
          goldUntil: member.goldUntil ?? null,
        }
      : null,
  };
}
