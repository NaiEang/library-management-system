import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../common/constants';
import { MembershipService } from '../../members/membership.service';
import { GOLD_MEMBER_KEY } from '../decorators/gold-member.decorator';
import { AuthUser } from '../types/auth-user';

export const GOLD_REQUIRED_MESSAGE = 'Gold membership required';

// Registered globally after JwtAuthGuard and RolesGuard, and acts only on
// routes marked @GoldMember(). Gold is read from the database on every
// request (isGold), so a gold period that just ended, or an account that was
// just disabled, stops working at once; nothing about gold is in the token.
@Injectable()
export class GoldMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membership: MembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(
      GOLD_MEMBER_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    // No user also covers @Public() + @GoldMember(): fails closed.
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.role !== RoleName.MEMBER || !user.memberId) {
      throw new ForbiddenException(GOLD_REQUIRED_MESSAGE);
    }
    // A database error here propagates (500): it denies, and never claims
    // "not gold" for someone who might be.
    if (!(await this.membership.isGold(user.memberId))) {
      throw new ForbiddenException(GOLD_REQUIRED_MESSAGE);
    }
    return true;
  }
}
