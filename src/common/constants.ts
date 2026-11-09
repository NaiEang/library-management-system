// Matches roles.name (lowercase, as in the database)
export enum RoleName {
  ADMIN = 'admin',
  LIBRARIAN = 'librarian',
  MEMBER = 'member',
}

const ROLE_NAMES = new Set<string>(Object.values(RoleName));

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.has(value);
}

// Account status. "Disabled" is set by an admin and blocks login.
export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

// "Blocked" (an overdue book, or members.blocked_until in the future) is not a
// membership status: Circulation computes it.
export enum MembershipStatus {
  PENDING_DEPOSIT = 'pending_deposit',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

export enum CopyCondition {
  NEW = 'new',
  GOOD = 'good',
  DAMAGED = 'damaged',
}

export enum CopyStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  BORROWED = 'borrowed',
  LOST = 'lost',
}

export enum LoanStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

export enum LoanItemStatus {
  REQUESTED = 'requested',
  BORROWED = 'borrowed',
  OVERDUE = 'overdue',
  RETURNED = 'returned',
}