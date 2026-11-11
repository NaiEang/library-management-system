import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { authConfig } from '../config/auth.config';
import { AuthUser, JwtPayload } from '../types/auth-user';
import { toAuthUser } from '../types/to-auth-user';

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

    const check = toAuthUser(user);
    if (!check.ok) {
      if (
        check.reason === 'unknown_role' ||
        check.reason === 'member_row_missing'
      ) {
        this.logger.warn(
          `User ${user?.id} has bad data (${check.reason}); access denied`,
        );
      }
      throw new UnauthorizedException();
    }
    return check.user;
  }
}
