import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { RoleName } from '../constants';
import type { AuthedRequest } from './auth-user';

export const ROLES_KEY = 'roles';
/** Only these roles may call the route. Routes without @Roles are left to the auth guard. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks routes a global JWT guard must skip (health checks, Prometheus scrapes). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    return context.switchToHttp().getRequest<AuthedRequest>().user;
  },
);
