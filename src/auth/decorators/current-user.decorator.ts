import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../types/auth-user';

export function currentUserFactory(
  data: keyof AuthUser | undefined,
  ctx: ExecutionContext,
) {
  const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
  // Public routes have no user; using @CurrentUser() there is a bug, so fail closed.
  if (!user) {
    throw new UnauthorizedException();
  }
  return data ? user[data] : user;
}

// @CurrentUser() returns { id, role, memberId? }; @CurrentUser('id') returns one field.
export const CurrentUser = createParamDecorator(currentUserFactory);
