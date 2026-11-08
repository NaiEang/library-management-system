// Matches roles.name
export enum RoleName {
  ADMIN = 'admin',
  LIBRARIAN = 'librarian',
  MEMBER = 'member',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum MembershipStatus {
  PENDING_DEPOSIT = 'pending_deposit',
  ACTIVE = 'active',
  BLOCKED = 'blocked',
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