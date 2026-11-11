import { RoleName } from '../common/constants';
import { canManage, roleSatisfies } from './role-ladder';

const { ADMIN, MANAGER, LIBRARIAN, MEMBER } = RoleName;

describe('roleSatisfies (who passes @Roles)', () => {
  it.each([
    // route requires librarian
    [ADMIN, [LIBRARIAN], true],
    [MANAGER, [LIBRARIAN], true],
    [LIBRARIAN, [LIBRARIAN], true],
    [MEMBER, [LIBRARIAN], false],
    // route requires manager
    [ADMIN, [MANAGER], true],
    [MANAGER, [MANAGER], true],
    [LIBRARIAN, [MANAGER], false],
    // route requires admin
    [ADMIN, [ADMIN], true],
    [MANAGER, [ADMIN], false],
    [LIBRARIAN, [ADMIN], false],
    // the existing two-role routes keep working
    [MANAGER, [ADMIN, LIBRARIAN], true],
    // members stand apart: staff don't pass member-only routes
    [ADMIN, [MEMBER], false],
    [MEMBER, [MEMBER], true],
  ] as const)('%s on @Roles(%j) → %s', (role, required, expected) => {
    expect(roleSatisfies(role, required)).toBe(expected);
  });
});

describe('canManage (who may reset / enable / disable whom)', () => {
  it.each([
    [ADMIN, ADMIN, true],
    [ADMIN, MANAGER, true],
    [ADMIN, LIBRARIAN, true],
    [ADMIN, MEMBER, true],
    [MANAGER, ADMIN, false],
    [MANAGER, MANAGER, false],
    [MANAGER, LIBRARIAN, true],
    [MANAGER, MEMBER, true],
    [LIBRARIAN, MANAGER, false],
    [LIBRARIAN, LIBRARIAN, false],
    [LIBRARIAN, MEMBER, true],
    [MEMBER, MEMBER, false],
  ] as const)('%s → %s: %s', (actor, target, expected) => {
    expect(canManage(actor, target)).toBe(expected);
  });
});
