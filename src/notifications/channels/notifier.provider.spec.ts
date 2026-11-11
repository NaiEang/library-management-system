import type { ConfigService } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { LogNotifier } from './log-notifier';
import { createNotifier } from './notifier.provider';

const config = (env: Record<string, string>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('createNotifier', () => {
  it('logs only when no SMTP host is configured', () => {
    expect(createNotifier(config({}))).toBeInstanceOf(LogNotifier);
  });

  it('sends email once SMTP_HOST is set', () => {
    expect(createNotifier(config({ SMTP_HOST: 'smtp.example.com' }))).toBeInstanceOf(
      EmailNotifier,
    );
  });
});

describe('EmailNotifier', () => {
  const smtp = { host: 'smtp.example.com', port: 587, secure: false, from: 'Library <lib@example.com>' };

  it('mails the user', async () => {
    const sendMail = vi.fn(() => Promise.resolve({}));
    await new EmailNotifier(smtp, { sendMail } as never).send({
      to: { userId: '7', email: 'student@example.com', name: 'Sok Dara' },
      subject: 'Book overdue',
      text: 'Your book "Clean Code" is overdue.',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Library <lib@example.com>',
      to: 'student@example.com',
      subject: 'Book overdue',
      text: 'Hello Sok Dara,\n\nYour book "Clean Code" is overdue.\n',
    });
  });

  it('skips a user without an email address', async () => {
    const sendMail = vi.fn();
    await new EmailNotifier(smtp, { sendMail } as never).send({
      to: { userId: '7', email: null, name: 'Sok' },
      subject: 's',
      text: 't',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
