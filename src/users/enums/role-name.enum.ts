export enum RoleName {
  ADMIN = 'ADMIN',
  LIBRARIAN = 'LIBRARIAN',
  MEMBER = 'MEMBER',
}

const ROLE_NAMES = new Set<string>(Object.values(RoleName));

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.has(value);
}
