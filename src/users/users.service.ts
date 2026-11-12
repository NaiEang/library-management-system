import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
import { checkPasswordPolicy } from '../auth/password/password-policy';
import { PasswordService } from '../auth/password/password.service';
import { MembershipStatus, RoleName, UserStatus } from '../common/constants';
import { Member } from '../members/entities/member.entity';
import { libraryToday } from '../members/library-date';
import { generateMemberCode } from '../members/member-code';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import {
  toUserProfile,
  UserProfileResponse,
} from './mappers/user-profile.mapper';
import { normalizeEmail } from './normalize';

// The minimum the auth guard needs on every request. Never includes the password hash.
export interface AuthUserRecord {
  id: string;
  username: string;
  status: string;
  roleName: string | null;
  memberId: string | null;
}

// Everything login needs. passwordHash is selected explicitly here and only here.
export interface LoginCandidate {
  id: string;
  email: string;
  username: string;
  status: string;
  passwordHash: string;
  roleName: string | null;
  memberId: string | null;
  membershipStatus: string | null;
  emailVerified: boolean;
}

// Input for a self-registered member. Normalized and validated by the caller;
// the password is already hashed.
export interface NewMemberInput {
  email: string;
  username: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// Who a verification code is for. Never includes the password hash.
export interface VerificationTarget {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
}

export interface RegisteredMember {
  id: string;
  email: string;
  username: string;
  memberId: string;
  memberCode: string;
}

// Input for a staff account created by a manager or admin. The password is
// plain here; the policy check and hashing happen in createStaff().
export interface NewStaffInput {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface StaffAccountResponse {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: RoleName;
  status: UserStatus;
}

const EMAIL_TAKEN = 'Email already registered';
const USERNAME_TAKEN = 'Username already taken';
const MEMBER_CODE_ATTEMPTS = 3;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
    private readonly passwordService: PasswordService,
  ) {}

  async findForAuth(id: string): Promise<AuthUserRecord | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { role: true, member: true },
      select: {
        id: true,
        username: true,
        status: true,
        role: { id: true, name: true },
        member: { id: true },
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      username: user.username,
      status: user.status,
      roleName: user.role?.name ?? null,
      memberId: user.member?.id ?? null,
    };
  }

  async findForLogin(email: string): Promise<LoginCandidate | null> {
    const user = await this.usersRepository.findOne({
      where: { email: normalizeEmail(email) },
      relations: { role: true, member: true },
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        passwordHash: true,
        emailVerifiedAt: true,
        role: { id: true, name: true },
        member: { id: true, membershipStatus: true },
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      passwordHash: user.passwordHash,
      roleName: user.role?.name ?? null,
      memberId: user.member?.id ?? null,
      membershipStatus: user.member?.membershipStatus ?? null,
      emailVerified: user.emailVerifiedAt != null,
    };
  }

  // Runs work in one database transaction (e.g. a password change plus ending
  // the user's sessions).
  inTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.usersRepository.manager.transaction(work);
  }

  // For password checks on an already-known user. The only other place that
  // selects the hash is findForLogin.
  async findPasswordHash(id: string): Promise<string | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: { id: true, passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.usersRepository.manager).update(
      User,
      { id },
      { passwordHash },
    );
  }

  async findVerificationTarget(id: string): Promise<VerificationTarget | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) {
      return null;
    }
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return {
      id: user.id,
      email: user.email,
      name: fullName || user.username,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
    };
  }

  // Only sets the date once: a verified email stays verified at its first date.
  async markEmailVerified(
    id: string,
    at: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager ?? this.usersRepository.manager).update(
      User,
      { id, emailVerifiedAt: IsNull() },
      { emailVerifiedAt: at },
    );
  }

  async recordLogin(id: string): Promise<void> {
    await this.usersRepository.update({ id }, { lastLoginAt: new Date() });
  }

  async findProfile(id: string): Promise<UserProfileResponse | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { role: true, member: true },
    });
    return user
      ? toUserProfile(user, libraryToday(this.config.libraryTimeZone))
      : null;
  }

  // Creates the MEMBER user and its pending_deposit member row in ONE
  // transaction: either both exist or neither does.
  async registerMember(input: NewMemberInput): Promise<RegisteredMember> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.usersRepository.manager.transaction((manager) =>
          this.insertMember(manager, input),
        );
      } catch (error) {
        // The pre-check below can race with a parallel sign-up; the unique
        // indexes are the final word.
        const column = uniqueViolationColumn(error);
        if (column === 'member_code' && attempt < MEMBER_CODE_ATTEMPTS) {
          continue;
        }
        throw conflictFor(error);
      }
    }
  }

  private async insertMember(
    manager: EntityManager,
    input: NewMemberInput,
  ): Promise<RegisteredMember> {
    const userId = await this.insertUser(manager, RoleName.MEMBER, input);

    // The library's date, not the database default (CURRENT_DATE is UTC on Supabase).
    const today = libraryToday(this.config.libraryTimeZone);
    const memberCode = generateMemberCode(today.slice(0, 4));
    const member = await manager.insert(Member, {
      userId,
      memberCode,
      membershipDate: today,
      expiryDate: null,
      membershipStatus: MembershipStatus.PENDING_DEPOSIT,
      depositAmount: 0,
    });

    return {
      id: userId,
      email: input.email,
      username: input.username,
      memberId: String(member.identifiers[0].id),
      memberCode,
    };
  }

  // Staff accounts have no member row. Who may create which role is decided by
  // the routes: librarians by managers and admins, managers by admins only.
  async createStaff(
    role: RoleName.LIBRARIAN | RoleName.MANAGER,
    input: NewStaffInput,
  ): Promise<StaffAccountResponse> {
    const problems = checkPasswordPolicy(input.password, {
      email: input.email,
      username: input.username,
    });
    if (problems.length > 0) {
      throw new BadRequestException(problems);
    }
    const passwordHash = await this.passwordService.hash(input.password);
    try {
      const id = await this.usersRepository.manager.transaction((manager) =>
        this.insertUser(manager, role, {
          email: input.email,
          username: input.username,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
        }),
      );
      return {
        id,
        email: input.email,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        role,
        status: UserStatus.ACTIVE,
      };
    } catch (error) {
      throw conflictFor(error);
    }
  }

  // Shared by sign-up and staff creation: duplicate check, role lookup, insert.
  private async insertUser(
    manager: EntityManager,
    roleName: RoleName,
    input: NewMemberInput,
  ): Promise<string> {
    const taken = await manager.findOne(User, {
      where: [{ email: input.email }, { username: input.username }],
      select: { id: true, email: true },
    });
    if (taken) {
      throw new ConflictException(
        taken.email === input.email ? EMAIL_TAKEN : USERNAME_TAKEN,
      );
    }

    const role = await manager.findOne(Role, {
      where: { name: roleName },
      select: { id: true },
    });
    if (!role) {
      throw new Error(`Role ${roleName} not found; run the migrations first`);
    }

    const inserted = await manager.insert(User, {
      roleId: role.id,
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      status: UserStatus.ACTIVE,
      // Staff are created by an admin or manager, who vouches for the email;
      // members prove it themselves with a code.
      emailVerifiedAt: roleName === RoleName.MEMBER ? null : new Date(),
    });
    return String(inserted.identifiers[0].id);
  }
}

// A unique violation on email or username (a parallel sign-up won the race)
// becomes a 409; any other error is returned unchanged.
function conflictFor(error: unknown): unknown {
  const column = uniqueViolationColumn(error);
  if (column === 'email') {
    return new ConflictException(EMAIL_TAKEN);
  }
  if (column === 'username') {
    return new ConflictException(USERNAME_TAKEN);
  }
  return error;
}

// The column behind a Postgres unique violation (23505), read from the error
// detail "Key (email)=(...) already exists."; null for any other error.
export function uniqueViolationColumn(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) {
    return null;
  }
  const driverError = error.driverError as { code?: string; detail?: string };
  if (driverError.code !== '23505') {
    return null;
  }
  return /Key \(([a-z_]+)\)=/.exec(driverError.detail ?? '')?.[1] ?? null;
}
