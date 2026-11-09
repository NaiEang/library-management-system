import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { RoleName } from '../../common/constants';
import { authConfig } from '../config/auth.config';
import { RefreshToken } from '../entities/refresh-token.entity';

export interface IssuedRefreshToken {
  // The raw token: goes to the cookie only, never to the database or a log.
  token: string;
  expiresAt: Date;
}

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

  // Starts a new session (a new family). Rotation arrives with feature 4.
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
}
