import { RoleName } from '../common/constants';

// Staff roles form a ladder: each one includes the staff roles below it, so a
// route for librarians also lets managers and admins in. Members stand apart.
const INCLUDES: Record<RoleName, readonly RoleName[]> = {
  [RoleName.ADMIN]: [RoleName.ADMIN, RoleName.MANAGER, RoleName.LIBRARIAN],
  [RoleName.MANAGER]: [RoleName.MANAGER, RoleName.LIBRARIAN],
  [RoleName.LIBRARIAN]: [RoleName.LIBRARIAN],
  [RoleName.MEMBER]: [RoleName.MEMBER],
};

const RANK: Record<RoleName, number> = {
  [RoleName.MEMBER]: 0,
  [RoleName.LIBRARIAN]: 1,
  [RoleName.MANAGER]: 2,
  [RoleName.ADMIN]: 3,
};

// For @Roles(): does a user with this role pass a route that requires any of these?
export function roleSatisfies(
  role: RoleName,
  required: readonly RoleName[],
): boolean {
  return required.some((needed) => INCLUDES[role].includes(needed));
}

// For account actions (reset, enable/disable): staff manage only accounts below
// them (a librarian manages members, a manager librarians and members). Admins
// manage everyone, other admins included. Acting on yourself is checked
// separately by each action.
export function canManage(actor: RoleName, target: RoleName): boolean {
  return actor === RoleName.ADMIN || RANK[actor] > RANK[target];
}
