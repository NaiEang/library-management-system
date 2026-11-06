import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
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

export interface RegisteredMember {
  id: string;
  email: string;
  username: string;
  memberId: string;
  memberCode: string;
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
  ) {}

  async findForAuth(id: string): Promise<AuthUserRecord | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { role: true, member: true },
      select: {
        id: true,
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
    };
  }

  async recordLogin(id: string): Promise<void> {
    await this.usersRepository.update({ id }, { lastLoginAt: new Date() });
  }

  async findProfile(id: string): Promise<UserProfileResponse | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: { role: true, member: true },
    });
    return user ? toUserProfile(user) : null;
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
        if (column === 'email') {
          throw new ConflictException(EMAIL_TAKEN);
        }
        if (column === 'username') {
          throw new ConflictException(USERNAME_TAKEN);
        }
        throw error;
      }
    }
  }

  private async insertMember(
    manager: EntityManager,
    input: NewMemberInput,
  ): Promise<RegisteredMember> {
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
      where: { name: RoleName.MEMBER },
      select: { id: true },
    });
    if (!role) {
      throw new Error('Role MEMBER not found; run the migrations first');
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
    });
    const userId = String(inserted.identifiers[0].id);

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
