import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../common/constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';

// Runs after JwtAuthGuard. The role it checks comes from the database
// (JwtStrategy.validate), not from the token claim.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<
      RoleName[] | undefined
    >(ROLES_KEY, targets);
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );

    // @Public() without @Roles: guests allowed. @Public() with @Roles is a
    // contradiction, so it falls through and requires a user (fails closed).
    if (isPublic && !requiredRoles) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
