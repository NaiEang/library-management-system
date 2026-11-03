import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

// The minimum the auth guard needs on every request. Never includes the password hash.
export interface AuthUserRecord {
  id: string;
  status: string;
  roleName: string | null;
  memberId: string | null;
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
}
