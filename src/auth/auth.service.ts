import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import {
  isRoleName,
  MembershipStatus,
  RoleName,
  UserStatus,
} from '../common/constants';
import { normalizeEmail } from '../users/normalize';
import { LoginCandidate, UsersService } from '../users/users.service';
import { AuthAuditService } from './audit/auth-audit.service';
import { authConfig } from './config/auth.config';
import { LoginResponse, RegisterResponse } from './dto/auth-responses';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import { checkPasswordPolicy } from './password/password-policy';
import { PasswordService } from './password/password.service';
import {
  IssuedRefreshToken,
  RefreshTokenService,
} from './tokens/refresh-token.service';
import type { AuthUser, JwtPayload } from './types/auth-user';

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

  // Any logged-in user. Ends every session of the user, so they log in again
  // with the new password (an attacker holding an old session is locked out).
  async changePassword(user: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const currentHash = await this.usersService.findPasswordHash(user.id);
    // The guard already checked the user exists; a missing hash is bad data.
    if (
      !currentHash ||
      !(await this.passwordService.verify(currentHash, dto.currentPassword))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await this.passwordService.verify(currentHash, dto.newPassword)) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }
    const profile = await this.usersService.findProfile(user.id);
    const problems = checkPasswordPolicy(dto.newPassword, {
      email: profile?.email,
      username: profile?.username,
    });
    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.usersService.inTransaction(async (manager) => {
      await this.usersService.updatePasswordHash(user.id, newHash, manager);
      await this.refreshTokens.revokeAllForUser(user.id, manager);
    });
  }

  // Self sign-up: always a MEMBER whose membership waits for the deposit.
  // Doesn't log the user in. Email and username arrive normalized (DTO).
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const problems = checkPasswordPolicy(dto.password, {
      email: dto.email,
      username: dto.username,
    });
    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }

    const member = await this.usersService.registerMember({
      email: dto.email,
      username: dto.username,
      passwordHash: await this.passwordService.hash(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });
    return {
      id: member.id,
      email: member.email,
      username: member.username,
      role: RoleName.MEMBER,
      membershipStatus: MembershipStatus.PENDING_DEPOSIT,
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
  if (candidate.status !== UserStatus.ACTIVE) {
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
