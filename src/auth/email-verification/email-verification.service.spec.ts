import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import type {
  UsersService,
  VerificationTarget,
} from '../../users/users.service';
import type { AuthAuditService } from '../audit/auth-audit.service';
import type { AuthConfig } from '../config/auth.config';
import { EmailVerificationCode } from '../entities/email-verification-code.entity';
import {
  ALREADY_VERIFIED,
  CODE_DEAD,
  CODE_EXPIRED,
  EmailVerificationService,
  NO_CODE,
  SEND_FAILED,
} from './email-verification.service';
import { deriveCodeKey, hashCode } from './verification-code';
import type { VerificationCodeSender } from './verification-code-sender';

const SECRET = 'unit-test-only-jwt-secret-4Hq9zLm2Xc7Vb1Nf';
const NOW = new Date('2026-11-12T03:00:00Z');
const key = deriveCodeKey(SECRET);

const member: VerificationTarget = {
  id: '12',
  email: 'good.student@demo.com',
  name: 'Good Student',
  emailVerifiedAt: null,
};

function codeRow(overrides: Partial<EmailVerificationCode> = {}) {
  return {
    userId: '12',
    codeHash: hashCode(key, '12', '042917'),
    expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    attempts: 0,
    sentAt: new Date(NOW.getTime() - 5 * 60_000),
    sendCount: 1,
    sendWindowStartedAt: new Date(NOW.getTime() - 5 * 60_000),
    ...overrides,
  } as EmailVerificationCode;
}

function setup({
  target = member as VerificationTarget | null,
  stored = true,
  row = codeRow() as EmailVerificationCode | null,
} = {}) {
  const lockedQuery = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    setLock: vi.fn().mockReturnThis(),
    getOne: vi.fn(() => Promise.resolve(row)),
  };
  const manager = {
    createQueryBuilder: vi.fn(() => lockedQuery),
    update: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  };
  const codes = {
    query: vi.fn(() => Promise.resolve(stored ? [{ user_id: '12' }] : [])),
    findOne: vi.fn(() => Promise.resolve(row)),
    manager: {
      transaction: vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
        work(manager),
      ),
    },
  };
  const usersService = {
    findVerificationTarget: vi.fn(() => Promise.resolve(target)),
    markEmailVerified: vi.fn(() => Promise.resolve()),
  };
  const sender = {
    sendVerificationCode: vi.fn(() => Promise.resolve()),
  };
  const audit = { record: vi.fn() };
  const service = new EmailVerificationService(
    codes as unknown as Repository<EmailVerificationCode>,
    usersService as unknown as UsersService,
    sender as VerificationCodeSender,
    audit as unknown as AuthAuditService,
    { jwtAccessSecret: SECRET } as AuthConfig,
  );
  return { service, codes, manager, lockedQuery, usersService, sender, audit };
}

describe('EmailVerificationService.sendCode', () => {
  it('stores only the HMAC and emails the code to the user', async () => {
    const { service, codes, sender } = setup();
    await service.sendCode('12', NOW);

    const [[, params]] = codes.query.mock.calls as unknown as [
      [string, unknown[]],
    ];
    expect(sender.sendVerificationCode).toHaveBeenCalledWith(
      { userId: '12', email: 'good.student@demo.com', name: 'Good Student' },
      expect.stringMatching(/^\d{6}$/),
      15,
    );
    const sentCode = (
      sender.sendVerificationCode.mock.calls[0] as unknown[]
    )[1];
    expect(params[1]).toBe(hashCode(key, '12', sentCode as string));
    expect(params).not.toContain(sentCode);
  });

  it('expires the code after 15 minutes, with a 60 s cooldown and a 24 h window of 10', async () => {
    const { service, codes } = setup();
    await service.sendCode('12', NOW);
    const [[sql, params]] = codes.query.mock.calls as unknown as [
      [string, unknown[]],
    ];
    expect(params[2]).toEqual(new Date('2026-11-12T03:15:00Z'));
    expect(params[3]).toEqual(NOW);
    expect(params[4]).toEqual(new Date('2026-11-11T03:00:00Z'));
    expect(params[5]).toEqual(new Date('2026-11-12T02:59:00Z'));
    expect(params[6]).toBe(10);
    // A new code resets the tries of the old one.
    expect(sql).toMatch(/"attempts" = 0/);
  });

  it('never logs or audits the code', async () => {
    const { service, sender, audit } = setup();
    await service.sendCode('12', NOW);
    const sentCode = (
      sender.sendVerificationCode.mock.calls[0] as unknown[]
    )[1];
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(sentCode);
    expect(audit.record).toHaveBeenCalledWith('EMAIL_CODE_SENT', {
      userId: '12',
    });
  });

  it('409 when the email is already verified, without creating a code', async () => {
    const { service, codes, sender } = setup({
      target: { ...member, emailVerifiedAt: new Date() },
    });
    await expect(service.sendCode('12', NOW)).rejects.toThrow(
      new ConflictException(ALREADY_VERIFIED),
    );
    expect(codes.query).not.toHaveBeenCalled();
    expect(sender.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('429 with the seconds left when the last code is less than a minute old', async () => {
    const { service, sender } = setup({
      stored: false,
      row: codeRow({ sentAt: new Date(NOW.getTime() - 20_000) }),
    });
    const error = await service.sendCode('12', NOW).catch((e: unknown) => e);
    expect((error as { getStatus(): number }).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as Error).message).toBe(
      'Please wait 40 seconds before asking for a new code',
    );
    expect(sender.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('429 "try again tomorrow" when the daily cap refused it', async () => {
    const { service } = setup({
      stored: false,
      row: codeRow({ sendCount: 10 }),
    });
    await expect(service.sendCode('12', NOW)).rejects.toThrow(
      /try again tomorrow/,
    );
  });

  it('503 when the email cannot be sent, without leaking the sender error', async () => {
    const { service, sender, audit } = setup();
    sender.sendVerificationCode.mockRejectedValueOnce(
      new Error('SMTP said: 550 for code 123456'),
    );
    const error = await service.sendCode('12', NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toBe(SEND_FAILED);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('550');
  });
});

describe('EmailVerificationService.verify', () => {
  it('accepts the right code: marks the email verified and deletes the code, in one transaction', async () => {
    const { service, codes, manager, lockedQuery, usersService } = setup();
    await service.verify('12', '042917', NOW);

    expect(codes.manager.transaction).toHaveBeenCalledTimes(1);
    expect(lockedQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(usersService.markEmailVerified).toHaveBeenCalledWith(
      '12',
      NOW,
      manager,
    );
    expect(manager.delete).toHaveBeenCalledWith(EmailVerificationCode, {
      userId: '12',
    });
  });

  it('counts a wrong code and says how many tries are left', async () => {
    const { service, manager, usersService } = setup({
      row: codeRow({ attempts: 2 }),
    });
    await expect(service.verify('12', '111111', NOW)).rejects.toThrow(
      new BadRequestException('Wrong code (2 tries left)'),
    );
    expect(manager.update).toHaveBeenCalledWith(
      EmailVerificationCode,
      { userId: '12' },
      { attempts: 3 },
    );
    expect(usersService.markEmailVerified).not.toHaveBeenCalled();
  });

  it('the 5th wrong code kills the code', async () => {
    const { service } = setup({ row: codeRow({ attempts: 4 }) });
    await expect(service.verify('12', '111111', NOW)).rejects.toThrow(
      new BadRequestException(CODE_DEAD),
    );
  });

  it('after 5 wrong codes even the right code is refused', async () => {
    const { service, usersService, manager } = setup({
      row: codeRow({ attempts: 5 }),
    });
    await expect(service.verify('12', '042917', NOW)).rejects.toThrow(
      new BadRequestException(CODE_DEAD),
    );
    expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('refuses the right code once it has expired', async () => {
    const { service, usersService } = setup({
      row: codeRow({ expiresAt: NOW }),
    });
    await expect(service.verify('12', '042917', NOW)).rejects.toThrow(
      new BadRequestException(CODE_EXPIRED),
    );
    expect(usersService.markEmailVerified).not.toHaveBeenCalled();
  });

  it('400 when no code was sent (or it was already used)', async () => {
    const { service } = setup({ row: null });
    await expect(service.verify('12', '042917', NOW)).rejects.toThrow(
      new BadRequestException(NO_CODE),
    );
  });

  it("refuses another user's code: the hash is bound to the user id", async () => {
    const { service, usersService } = setup({
      row: codeRow({ codeHash: hashCode(key, '13', '042917') }),
    });
    await expect(service.verify('12', '042917', NOW)).rejects.toThrow(
      /Wrong code/,
    );
    expect(usersService.markEmailVerified).not.toHaveBeenCalled();
  });

  it('409 when the email is already verified', async () => {
    const { service, codes } = setup({
      target: { ...member, emailVerifiedAt: new Date() },
    });
    await expect(service.verify('12', '042917', NOW)).rejects.toThrow(
      new ConflictException(ALREADY_VERIFIED),
    );
    expect(codes.manager.transaction).not.toHaveBeenCalled();
  });
});
