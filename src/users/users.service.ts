import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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
}
