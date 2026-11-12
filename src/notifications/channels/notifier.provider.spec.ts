import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { emailConfigFrom } from './email.config';
import { LogNotifier } from './log-notifier';
import {
  createEmailNotifier,
  createNotifiers,
  createTelegramNotifier,
} from './notifier.provider';

const config = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('createNotifiers', () => {
  const telegramOff = createTelegramNotifier(config({}));

  it('logs only when neither SMTP nor Telegram is configured', () => {
    const channels = createNotifiers(
      createEmailNotifier(config({})),
      telegramOff,
    );
    expect(channels).toHaveLength(1);
    expect(channels[0]).toBeInstanceOf(LogNotifier);
  });

  it('reuses the email notifier once SMTP_HOST is set', () => {
    const email = createEmailNotifier(
      config({ SMTP_HOST: 'smtp.example.com' }),
    );
    expect(createNotifiers(email, telegramOff)).toEqual([email]);
  });

  it('adds Telegram once TELEGRAM_BOT_TOKEN is set', () => {
    const email = createEmailNotifier(
      config({ SMTP_HOST: 'smtp.example.com' }),
    );
    const telegram = createTelegramNotifier(
      config({ TELEGRAM_BOT_TOKEN: '123:abc' }),
    );
    expect(createNotifiers(email, telegram)).toEqual([email, telegram]);
  });
});

describe('emailConfigFrom', () => {
  it('reads the SMTP settings once SMTP_HOST is set', () => {
    expect(
      emailConfigFrom(
        config({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' }),
      ).smtp,
    ).toMatchObject({ host: 'smtp.example.com', port: 465, secure: true });
    expect(emailConfigFrom(config({})).smtp).toBeNull();
  });

  it.each(['development', 'test'])(
    'prints codes when NODE_ENV is explicitly %s',
    (env) => {
      expect(
        emailConfigFrom(config({ NODE_ENV: env })).printCodesWithoutSmtp,
      ).toBe(true);
    },
  );

  it.each(['production', 'staging', ''])(
    'NODE_ENV=%s: never prints codes (fails closed)',
    (env) => {
      expect(
        emailConfigFrom(config({ NODE_ENV: env })).printCodesWithoutSmtp,
      ).toBe(false);
    },
  );

  it('never prints codes when NODE_ENV is not set', () => {
    expect(emailConfigFrom(config({})).printCodesWithoutSmtp).toBe(false);
  });
});

describe('EmailNotifier without SMTP', () => {
  const recipient = { userId: '12', email: 'a@b.test', name: 'A B' };
  afterEach(() => vi.restoreAllMocks());

  it('prints the code when the config allows it (development)', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await new EmailNotifier({
      smtp: null,
      printCodesWithoutSmtp: true,
    }).sendVerificationCode(recipient, '042917', 15);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('042917'));
  });

  it('otherwise never prints, and sending fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const log = vi.spyOn(Logger.prototype, 'log');
    const error = await new EmailNotifier({
      smtp: null,
      printCodesWithoutSmtp: false,
    })
      .sendVerificationCode(recipient, '042917', 15)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('042917');
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('fails send() instead of pretending a reminder was emailed', async () => {
    await expect(
      new EmailNotifier({ smtp: null, printCodesWithoutSmtp: true }).send({
        to: recipient,
        subject: 's',
        text: 't',
      }),
    ).rejects.toThrow('No SMTP server');
  });
});

describe('EmailNotifier', () => {
  const smtp = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    from: 'Library <lib@example.com>',
  };
  const withSmtp = { smtp, printCodesWithoutSmtp: false };

  it('mails the user', async () => {
    const sendMail = vi.fn(() => Promise.resolve({}));
    await new EmailNotifier(withSmtp, { sendMail } as never).send({
      to: { userId: '7', email: 'student@example.com', name: 'Sok Dara' },
      subject: 'Book overdue',
      text: 'Your book "Clean Code" is overdue.',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Library <lib@example.com>',
      to: 'student@example.com',
      subject: 'Book overdue',
      text: 'Hello Sok Dara,\n\nYour book "Clean Code" is overdue.\n\n— LibraFlow Library\n',
    });
  });

  it('skips a user without an email address', async () => {
    const sendMail = vi.fn();
    await new EmailNotifier(withSmtp, { sendMail } as never).send({
      to: { userId: '7', email: null, name: 'Sok' },
      subject: 's',
      text: 't',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  const recipient = {
    userId: '7',
    email: 'student@example.com',
    name: 'Sok Dara',
  };

  it('emails a verification code with its expiry', async () => {
    const sendMail = vi.fn(() => Promise.resolve({}));
    await new EmailNotifier(withSmtp, {
      sendMail,
    } as never).sendVerificationCode(recipient, '042917', 15);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Library <lib@example.com>',
      to: 'student@example.com',
      subject: 'Your LibraFlow verification code',
      text: expect.stringMatching(
        /Sok Dara[\s\S]*042917[\s\S]*15 minutes/,
      ) as unknown as string,
    });
  });

  it('throws when the verification email fails, so the user can retry', async () => {
    const sendMail = vi.fn(() => Promise.reject(new Error('SMTP down')));
    await expect(
      new EmailNotifier(withSmtp, { sendMail } as never).sendVerificationCode(
        recipient,
        '042917',
        15,
      ),
    ).rejects.toThrow('SMTP down');
  });

  it('throws instead of skipping a code for a user without an email address', async () => {
    const sendMail = vi.fn();
    await expect(
      new EmailNotifier(withSmtp, { sendMail } as never).sendVerificationCode(
        { ...recipient, email: '' },
        '042917',
        15,
      ),
    ).rejects.toThrow('no email address');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
