import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { RoleName, UserStatus } from '../../common/constants';
import { User } from '../../users/entities/user.entity';
import { PasswordService } from '../password/password.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import type { AuthUser } from '../types/auth-user';

export interface AccountStatusResponse {
  id: string;
  username: string;
  role: string;
  status: UserStatus;
}

export interface PasswordResetResponse {
  id: string;
  username: string;
  // Shown once. Staff hand it to the user, who then changes it.
  temporaryPassword: string;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly refreshTokens: RefreshTokenService,
    private readonly passwordService: PasswordService,
  ) {}

  // Admin-only (the route has @Roles(ADMIN)). Both directions end every session
  // of the user; a disabled user's access tokens also stop working at once,
  // because the guard checks the account status on every request.
  async setStatus(
    targetId: string,
    enabled: boolean,
    actor: AuthUser,
  ): Promise<AccountStatusResponse> {
    if (targetId === actor.id) {
      throw new ForbiddenException('You cannot change your own account status');
    }
    const status = enabled ? UserStatus.ACTIVE : UserStatus.DISABLED;

    return this.users.manager.transaction(async (manager) => {
      // "account", not "user": TypeORM leaves the alias unquoted in
      // FOR UPDATE OF, and user is a reserved word in Postgres.
      const target = await manager
        .createQueryBuilder(User, 'account')
        .innerJoinAndSelect('account.role', 'role')
        .setLock('pessimistic_write', undefined, ['account'])
        .where('account.id = :id', { id: targetId })
        .getOne();
      if (!target) {
        throw new NotFoundException('User not found');
      }

      if (
        !enabled &&
        target.role.name === RoleName.ADMIN &&
        target.status === UserStatus.ACTIVE
      ) {
        // Lock every active admin row, so two admins disabling each other at
        // the same moment can't leave the library with no admin at all.
        // Postgres can't combine FOR UPDATE with COUNT(*), so lock the rows
        // and count them here.
        const activeAdmins = (
          await manager
            .createQueryBuilder(User, 'account')
            .select('account.id')
            .setLock('pessimistic_write')
            .where('account.roleId = :roleId AND account.status = :status', {
              roleId: target.roleId,
              status: UserStatus.ACTIVE,
            })
            .getMany()
        ).length;
        if (activeAdmins <= 1) {
          throw new ConflictException(
            'The last active admin cannot be disabled',
          );
        }
      }

      await manager.update(User, { id: targetId }, { status });
      await this.refreshTokens.revokeAllForUser(targetId, manager);
      return {
        id: target.id,
        username: target.username,
        role: target.role.name,
        status,
      };
    });
  }

  // "Forgot password" without email: staff set a random temporary password at
  // the desk. An admin can reset anyone but themselves; a librarian only members.
  async resetPassword(
    targetId: string,
    actor: AuthUser,
  ): Promise<PasswordResetResponse> {
    if (targetId === actor.id) {
      throw new BadRequestException(
        'Use PATCH /auth/password to change your own password',
      );
    }
    const target = await this.users.findOne({
      where: { id: targetId },
      relations: { role: true },
      select: { id: true, username: true, role: { id: true, name: true } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (
      actor.role === RoleName.LIBRARIAN &&
      target.role.name !== RoleName.MEMBER
    ) {
      throw new ForbiddenException(
        'Librarians can only reset members’ passwords',
      );
    }

    // 12 random characters from a 64-character alphabet: about 72 bits.
    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.users.manager.transaction(async (manager) => {
      await manager.update(User, { id: targetId }, { passwordHash });
      await this.refreshTokens.revokeAllForUser(targetId, manager);
    });
    return { id: target.id, username: target.username, temporaryPassword };
  }
}
