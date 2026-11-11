import { isRoleName, RoleName, UserStatus } from '../../common/constants';
import type { AuthUserRecord } from '../../users/users.service';
import type { AuthUser } from './auth-user';

export type AuthUserCheck =
  | { ok: true; user: AuthUser }
  | {
      ok: false;
      reason: 'missing' | 'disabled' | 'unknown_role' | 'member_row_missing';
    };

// The one rule for "may this account use a token": shared by the JWT guard
// (every request) and by /auth/refresh, so they can never disagree.
export function toAuthUser(record: AuthUserRecord | null): AuthUserCheck {
  if (!record) {
    return { ok: false, reason: 'missing' };
  }
  if (record.status !== UserStatus.ACTIVE) {
    return { ok: false, reason: 'disabled' };
  }
  if (!isRoleName(record.roleName)) {
    return { ok: false, reason: 'unknown_role' };
  }
  const role = record.roleName;
  if (role !== RoleName.MEMBER) {
    return {
      ok: true,
      user: { id: record.id, username: record.username, role },
    };
  }
  // Register creates the user and member rows together, so a MEMBER without a
  // member row is corrupt data: deny rather than hand teammates no memberId.
  if (!record.memberId) {
    return { ok: false, reason: 'member_row_missing' };
  }
  return {
    ok: true,
    user: {
      id: record.id,
      username: record.username,
      role,
      memberId: record.memberId,
    },
  };
}
