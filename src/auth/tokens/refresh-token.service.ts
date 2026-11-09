import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { RoleName } from '../../common/constants';
import { authConfig } from '../config/auth.config';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface IssuedRefreshToken {
  // The raw token: goes to the cookie only, never to the database or a log.
  token: string;
  expiresAt: Date;
}

export type RotationResult =
  // The presented token was valid: a successor was issued in the same family.
  | {
      outcome: 'rotated';
      userId: string;
      familyId: string;
      token: string;
      expiresAt: Date;
    }
  // An already-rotated token came back: a copy was stolen or kept. The whole
  // family has been revoked.
  | { outcome: 'reuse'; userId: string; familyId: string }
  // Unknown, expired, or ended by logout / password change / disable.
  | { outcome: 'invalid' };

export interface IssueRefreshTokenInput {
  userId: string;
  role: RoleName;
  ip?: string;
  userAgent?: string;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  // Starts a new session (a new family).
  async issue({
    userId,
    role,
    ip,
    userAgent,
  }: IssueRefreshTokenInput): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    // Staff use shared desk computers, so their sessions end sooner.
    const absoluteTtl =
      role === RoleName.MEMBER
        ? this.config.refreshAbsoluteTtlMemberSeconds
        : this.config.refreshAbsoluteTtlStaffSeconds;
    const absoluteExpiresAt = new Date(now + absoluteTtl * 1000);
    const expiresAt = new Date(
      Math.min(
        now + this.config.refreshIdleTtlSeconds * 1000,
        absoluteExpiresAt.getTime(),
      ),
    );

    await this.refreshTokens.insert({
      userId,
      familyId: randomUUID(),
      tokenHash: hashRefreshToken(token),
      expiresAt,
      absoluteExpiresAt,
      userAgent: userAgent?.slice(0, 255) ?? null,
      ipAddress: ip?.slice(0, 45) ?? null,
    });
    return { token, expiresAt };
  }

  // One refresh: the presented token is used up and replaced by a new one in
  // the same family, with a fresh idle limit but the same absolute end. The row
  // is locked, so the same token can't be rotated twice in parallel.
  async rotate(
    rawToken: string,
    client: { ip?: string; userAgent?: string } = {},
  ): Promise<RotationResult> {
    return this.refreshTokens.manager.transaction(async (manager) => {
      const current = await manager
        .createQueryBuilder(RefreshToken, 'rt')
        .setLock('pessimistic_write')
        .where('rt.tokenHash = :hash', { hash: hashRefreshToken(rawToken) })
        .getOne();
      if (!current) {
        return { outcome: 'invalid' };
      }
      if (current.revokedAt) {
        // Only a token that was rotated before (it has a successor) is reuse;
        // one ended by logout or a password change is just dead.
        if (!current.replacedBy) {
          return { outcome: 'invalid' };
        }
        await this.revokeFamily(current.familyId, manager);
        return {
          outcome: 'reuse',
          userId: current.userId,
          familyId: current.familyId,
        };
      }
      const now = Date.now();
      if (
        current.expiresAt.getTime() <= now ||
        current.absoluteExpiresAt.getTime() <= now
      ) {
        return { outcome: 'invalid' };
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        Math.min(
          now + this.config.refreshIdleTtlSeconds * 1000,
          current.absoluteExpiresAt.getTime(),
        ),
      );
      const inserted = await manager.insert(RefreshToken, {
        userId: current.userId,
        familyId: current.familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt,
        absoluteExpiresAt: current.absoluteExpiresAt,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ipAddress: client.ip?.slice(0, 45) ?? null,
      });
      await manager.update(
        RefreshToken,
        { id: current.id },
        {
          revokedAt: new Date(now),
          replacedBy: String(inserted.identifiers[0].id),
        },
      );
      return {
        outcome: 'rotated',
        userId: current.userId,
        familyId: current.familyId,
        token,
        expiresAt,
      };
    });
  }

  // Logout: ends the login session the token belongs to. Unknown tokens are
  // ignored, so the answer never reveals whether a token exists.
  async revokeFamilyOf(rawToken: string): Promise<void> {
    const token = await this.refreshTokens.findOne({
      where: { tokenHash: hashRefreshToken(rawToken) },
      select: { id: true, familyId: true },
    });
    if (token) {
      await this.revokeFamily(token.familyId);
    }
  }

  async revokeFamily(
    familyId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const { affected } = await (manager ?? this.refreshTokens.manager).update(
      RefreshToken,
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return affected ?? 0;
  }

  // Ends every session of a user (password change, reset, enable/disable).
  // Pass a transaction's manager to make it part of that transaction.
  async revokeAllForUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const { affected } = await (manager ?? this.refreshTokens.manager).update(
      RefreshToken,
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return affected ?? 0;
  }
}
