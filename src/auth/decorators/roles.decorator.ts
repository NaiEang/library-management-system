import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../../common/constants';

export const ROLES_KEY = 'roles';

// Restricts a route (or a whole controller) to these roles. A method-level
// @Roles overrides the controller-level one. Without @Roles, any logged-in
// user may call the route.
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
