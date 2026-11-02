import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleName } from '../constants';
import type { AuthedRequest } from './auth-user';
import { ROLES_KEY } from './roles.decorator';

/** Enforces @Roles against `request.user`, whoever set it (JWT guard or the dev header). */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('Auth');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleName[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user) throw new UnauthorizedException();
    if (!roles.includes(user.role)) {
      this.logger.warn(
        `${user.role} ${user.username} denied ${request.method} ${request.path}`,
      );
      throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`);
    }
    return true;
  }
}
