import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isRoleName, RoleName, UserStatus } from '../../common/constants';
import { UsersService } from '../../users/users.service';
import { authConfig } from '../config/auth.config';
import { AuthUser, JwtPayload } from '../types/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @Inject(authConfig.KEY) config: ConfigType<typeof authConfig>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtAccessSecret,
      // Pinned: rejects alg "none" and any other algorithm.
      algorithms: ['HS256'],
    });
  }

  // Called only after the signature and exp are verified. Loads the user on
  // every request so a disabled account is locked out immediately.
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) {
      throw new UnauthorizedException();
    }

    let user: Awaited<ReturnType<UsersService['findForAuth']>>;
    try {
      user = await this.usersService.findForAuth(payload.sub);
    } catch (error) {
      // A database error must deny, never allow.
      this.logger.warn(
        `User lookup failed during authentication: ${(error as Error).message}`,
      );
      throw new UnauthorizedException();
    }

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    if (!isRoleName(user.roleName)) {
      this.logger.warn(`User ${user.id} has an unknown role; access denied`);
      throw new UnauthorizedException();
    }

    const role = user.roleName;
    if (role !== RoleName.MEMBER) {
      return { id: user.id, username: user.username, role };
    }
    // Register creates the user and member rows together, so a MEMBER without
    // a member row is corrupt data: deny rather than hand teammates no memberId.
    if (!user.memberId) {
      this.logger.warn(
        `Member user ${user.id} has no member row; access denied`,
      );
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      username: user.username,
      role,
      memberId: user.memberId,
    };
  }
}
