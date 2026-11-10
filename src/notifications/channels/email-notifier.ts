import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { Notifier, OutgoingMessage } from './notifier';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class EmailNotifier implements Notifier {
  readonly channel = 'email';
  private readonly logger = new Logger('Notifier');

  constructor(
    private readonly config: SmtpConfig,
    private readonly transport: Pick<Transporter, 'sendMail'> = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    }),
  ) {}

  async send(message: OutgoingMessage): Promise<void> {
    if (!message.to.email) {
      this.logger.warn(`user ${message.to.userId} has no email; skipped`);
      return;
    }
    // A thrown error fails the job, and BullMQ retries it with backoff
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to.email,
      subject: message.subject,
      text: `Hello ${message.to.name},\n\n${message.text}\n`,
    });
  }
}
