import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { AuthAuditService } from '../audit/auth-audit.service';
import { authConfig } from '../config/auth.config';
import { EmailVerificationCode } from '../entities/email-verification-code.entity';
import {
  CODE_TTL_MINUTES,
  deriveCodeKey,
  generateCode,
  hashCode,
  hashesMatch,
  MAX_ATTEMPTS_PER_CODE,
  MAX_SENDS_PER_WINDOW,
  RESEND_COOLDOWN_SECONDS,
  SEND_WINDOW_HOURS,
} from './verification-code';
import {
  VERIFICATION_CODE_SENDER,
  type VerificationCodeSender,
} from './verification-code-sender';

export const ALREADY_VERIFIED = 'Email already verified';
export const NO_CODE = 'No verification code was sent; request a new one';
export const CODE_EXPIRED = 'This code has expired; request a new one';
export const CODE_DEAD = 'Too many wrong codes; request a new one';
export const SEND_FAILED =
  'The verification email could not be sent; try again in a minute';

type VerifyOutcome =
  | { result: 'verified' }
  | { result: 'no_code' | 'expired' | 'dead' }
  | { result: 'wrong'; attemptsLeft: number };

// Owns the code: creates it, stores only its HMAC, checks it and marks the
// email verified. Sending the email is the VerificationCodeSender's job.
@Injectable()
export class EmailVerificationService {
  private readonly key: Buffer;

  constructor(
    @InjectRepository(EmailVerificationCode)
    private readonly codes: Repository<EmailVerificationCode>,
    private readonly usersService: UsersService,
    @Inject(VERIFICATION_CODE_SENDER)
    private readonly sender: VerificationCodeSender,
    private readonly audit: AuthAuditService,
    @Inject(authConfig.KEY) config: ConfigType<typeof authConfig>,
  ) {
    this.key = deriveCodeKey(config.jwtAccessSecret);
  }

  // Creates a new code (the old one stops working) and emails it.
  async sendCode(userId: string, now = new Date()): Promise<void> {
    const user = await this.usersService.findVerificationTarget(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException(ALREADY_VERIFIED);
    }

    const code = generateCode();
    const stored = await this.storeCode(
      userId,
      hashCode(this.key, userId, code),
      now,
    );
    if (!stored) {
      throw await this.tooManyRequests(userId, now);
    }

    try {
      await this.sender.sendVerificationCode(
        { userId, email: user.email, name: user.name },
        code,
        CODE_TTL_MINUTES,
      );
    } catch {
      // The error may contain the message; record only that sending failed.
      this.audit.record('EMAIL_CODE_SEND_FAILED', { userId });
      throw new ServiceUnavailableException(SEND_FAILED);
    }
    this.audit.record('EMAIL_CODE_SENT', { userId });
  }

  // Checks the code. Wrong guesses are counted even though the request fails.
  async verify(userId: string, code: string, now = new Date()): Promise<void> {
    const user = await this.usersService.findVerificationTarget(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException(ALREADY_VERIFIED);
    }

    const outcome = await this.checkCode(userId, code, now);
    switch (outcome.result) {
      case 'verified':
        this.audit.record('EMAIL_VERIFIED', { userId });
        return;
      case 'wrong':
        this.audit.record('EMAIL_CODE_WRONG', { userId });
        throw new BadRequestException(
          outcome.attemptsLeft > 0
            ? `Wrong code (${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? 'try' : 'tries'} left)`
            : CODE_DEAD,
        );
      case 'no_code':
        throw new BadRequestException(NO_CODE);
      case 'expired':
        throw new BadRequestException(CODE_EXPIRED);
      case 'dead':
        throw new BadRequestException(CODE_DEAD);
    }
  }

  // One atomic statement: insert the code, or replace the old one only when the
  // cooldown has passed and the daily cap isn't reached. Two requests at once
  // can't both pass. Returns false when the limits refused it.
  private async storeCode(
    userId: string,
    codeHash: string,
    now: Date,
  ): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
    const cooldownCutoff = new Date(
      now.getTime() - RESEND_COOLDOWN_SECONDS * 1000,
    );
    const windowCutoff = new Date(
      now.getTime() - SEND_WINDOW_HOURS * 3_600_000,
    );
    const rows: unknown[] = await this.codes.query(
      `INSERT INTO "email_verification_codes" AS c
         ("user_id", "code_hash", "expires_at", "attempts", "sent_at", "send_count", "send_window_started_at")
       VALUES ($1, $2, $3, 0, $4, 1, $4)
       ON CONFLICT ("user_id") DO UPDATE SET
         "code_hash" = EXCLUDED."code_hash",
         "expires_at" = EXCLUDED."expires_at",
         "attempts" = 0,
         "sent_at" = EXCLUDED."sent_at",
         "send_count" = CASE WHEN c."send_window_started_at" <= $5 THEN 1 ELSE c."send_count" + 1 END,
         "send_window_started_at" = CASE WHEN c."send_window_started_at" <= $5 THEN EXCLUDED."sent_at" ELSE c."send_window_started_at" END
       WHERE c."sent_at" <= $6
         AND (c."send_window_started_at" <= $5 OR c."send_count" < $7)
       RETURNING c."user_id"`,
      [
        userId,
        codeHash,
        expiresAt,
        now,
        windowCutoff,
        cooldownCutoff,
        MAX_SENDS_PER_WINDOW,
      ],
    );
    return rows.length > 0;
  }

  // Explains which limit refused the new code (the row exists in that case).
  private async tooManyRequests(
    userId: string,
    now: Date,
  ): Promise<HttpException> {
    const row = await this.codes.findOne({ where: { userId } });
    const waitSeconds = row
      ? Math.ceil(
          (row.sentAt.getTime() +
            RESEND_COOLDOWN_SECONDS * 1000 -
            now.getTime()) /
            1000,
        )
      : 0;
    this.audit.record('EMAIL_CODE_LIMITED', { userId });
    return new HttpException(
      waitSeconds > 0
        ? `Please wait ${waitSeconds} seconds before asking for a new code`
        : 'Too many codes requested today; try again tomorrow',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // Locks the user's code row, so parallel guesses are counted one by one and
  // can't exceed the limit. The transaction commits the counted attempt even
  // when the guess is wrong; the caller throws afterwards.
  private checkCode(
    userId: string,
    code: string,
    now: Date,
  ): Promise<VerifyOutcome> {
    return this.codes.manager.transaction(async (manager) => {
      const row = await manager
        .createQueryBuilder(EmailVerificationCode, 'code')
        .addSelect('code.codeHash')
        .where('code.userId = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();

      if (!row) {
        return { result: 'no_code' };
      }
      if (row.attempts >= MAX_ATTEMPTS_PER_CODE) {
        return { result: 'dead' };
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        return { result: 'expired' };
      }
      if (!hashesMatch(hashCode(this.key, userId, code), row.codeHash)) {
        const attempts = row.attempts + 1;
        await manager.update(EmailVerificationCode, { userId }, { attempts });
        return {
          result: 'wrong',
          attemptsLeft: MAX_ATTEMPTS_PER_CODE - attempts,
        };
      }

      await this.usersService.markEmailVerified(userId, now, manager);
      await manager.delete(EmailVerificationCode, { userId });
      return { result: 'verified' };
    });
  }
}
