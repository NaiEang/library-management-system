import {
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AccountStatus } from '../users/enums/account-status.enum';
import { isRoleName, RoleName } from '../users/enums/role-name.enum';
import { normalizeEmail } from '../users/normalize';
import { LoginCandidate, UsersService } from '../users/users.service';
import { AuthAuditService } from './audit/auth-audit.service';
import { authConfig } from './config/auth.config';
import { LoginResponse } from './dto/auth-responses';
import { PasswordService } from './password/password.service';
import {
  IssuedRefreshToken,
  RefreshTokenService,
} from './tokens/refresh-token.service';
import { JwtPayload } from './types/auth-user';

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  body: LoginResponse;
  refresh: IssuedRefreshToken;
}

// One message for every failure, so the response never reveals whether the
// email exists, the password was wrong or the account is disabled.
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService implements OnModuleInit {
  // A hash of a random secret nobody knows. Unknown emails are checked
  // against it, so they take as long as a wrong password.
  private dummyHash = '';

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly audit: AuthAuditService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.passwordService.hash(
      randomBytes(32).toString('hex'),
    );
  }

  async login({
    email,
    password,
    ip,
    userAgent,
  }: LoginInput): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(email);
    const candidate = await this.usersService.findForLogin(normalizedEmail);
    // Always run one argon2 verification, found or not.
    const passwordMatches = await this.passwordService.verify(
      candidate?.passwordHash ?? this.dummyHash,
      password,
    );

    const failure = loginFailureReason(candidate, passwordMatches);
    // loginFailureReason already covers the last two checks; repeating them
    // here lets TypeScript know candidate and its role are valid below.
    if (failure || !candidate || !isRoleName(candidate.roleName)) {
      this.audit.record('LOGIN_FAILURE', {
        userId: candidate?.id ?? null,
        email: normalizedEmail,
        ip,
        reason: failure ?? 'unknown_role',
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const role = candidate.roleName;
    const refresh = await this.refreshTokens.issue({
      userId: candidate.id,
      role,
      ip,
      userAgent,
    });
    await this.usersService.recordLogin(candidate.id);
    const payload: JwtPayload = { sub: candidate.id, role };
    const accessToken = await this.jwtService.signAsync(payload);

    this.audit.record('LOGIN_SUCCESS', {
      userId: candidate.id,
      email: normalizedEmail,
      ip,
    });
    return {
      body: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.config.jwtAccessTtlSeconds,
        user: {
          id: candidate.id,
          email: candidate.email,
          username: candidate.username,
          role,
          membershipStatus: candidate.membershipStatus,
        },
      },
      refresh,
    };
  }
}

// Server-side reason for the audit log only; the client always gets the same 401.
function loginFailureReason(
  candidate: LoginCandidate | null,
  passwordMatches: boolean,
): string | null {
  if (!candidate) {
    return 'unknown_email';
  }
  if (!passwordMatches) {
    return 'wrong_password';
  }
  if (candidate.status !== AccountStatus.ACTIVE) {
    return 'disabled';
  }
  if (!isRoleName(candidate.roleName)) {
    return 'unknown_role';
  }
  // Same rule as JwtStrategy: a MEMBER without a member row is corrupt data.
  if (candidate.roleName === RoleName.MEMBER && !candidate.memberId) {
    return 'member_row_missing';
  }
  return null;
}
