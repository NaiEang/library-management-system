import { Logger } from '@nestjs/common';
import {
  createSmtpTransport,
  type EmailConfig,
  type MailTransport,
} from './email.config';
import {
  SIGN_OFF,
  type Notifier,
  type OutgoingMessage,
  type Recipient,
} from './notifier';

// All outgoing email. send() is used when email is the NOTIFIER channel;
// sendVerificationCode() always goes by email, whatever NOTIFIER is.
// Without SMTP nothing can be emailed: send() fails, and verification codes
// are printed only when the config allows it (development/test).
export class EmailNotifier implements Notifier {
  readonly channel = 'email';
  private readonly logger = new Logger('Notifier');

  constructor(
    private readonly config: EmailConfig,
    private readonly transport: MailTransport | null = config.smtp
      ? createSmtpTransport(config.smtp)
      : null,
  ) {}

  get configured(): boolean {
    return this.transport !== null;
  }

  async send(message: OutgoingMessage): Promise<void> {
    if (!message.to.email) {
      this.logger.warn(`user ${message.to.userId} has no email; skipped`);
      return;
    }
    // A thrown error fails the job, and BullMQ retries it with backoff
    await this.mail(
      message.to.email,
      message.subject,
      `Hello ${message.to.name},\n\n${message.text}\n\n${SIGN_OFF}\n`,
    );
  }

  // The code is never stored or logged (outside development). Any failure,
  // including a missing address, is thrown so the user is asked to try again.
  async sendVerificationCode(
    recipient: Recipient,
    code: string,
    expiresInMinutes: number,
  ): Promise<void> {
    if (!this.configured && this.config.printCodesWithoutSmtp) {
      this.logger.warn(
        `DEVELOPMENT ONLY: verification code for user ${recipient.userId} is ${code} (valid ${expiresInMinutes} min)`,
      );
      return;
    }
    if (!recipient.email) {
      throw new Error('Recipient has no email address');
    }
    await this.mail(
      recipient.email,
      'Your LibraFlow verification code',
      `Hello ${recipient.name},\n\n` +
        `Your verification code is ${code}\n\n` +
        `It expires in ${expiresInMinutes} minutes. ` +
        `If you did not create a LibraFlow account, you can ignore this email.\n\n` +
        `${SIGN_OFF}\n`,
    );
  }

  private async mail(to: string, subject: string, text: string): Promise<void> {
    if (!this.transport || !this.config.smtp) {
      throw new Error('No SMTP server is configured');
    }
    await this.transport.sendMail({
      from: this.config.smtp.from,
      to,
      subject,
      text,
    });
  }
}
