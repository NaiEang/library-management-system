import type { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface EmailConfig {
  // null when SMTP_HOST is not set: nothing can be emailed.
  smtp: SmtpConfig | null;
  // Without SMTP, print verification codes to the console instead. Only true
  // when NODE_ENV is explicitly development or test (fails closed).
  printCodesWithoutSmtp: boolean;
}

export type MailTransport = Pick<Transporter, 'sendMail'>;

const PRINTS_CODES = new Set(['development', 'test']);

// Email settings from the environment (see .env.example)
export function emailConfigFrom(config: ConfigService): EmailConfig {
  const nodeEnv = config.get<string>('NODE_ENV');
  return {
    smtp: smtpConfigFrom(config),
    printCodesWithoutSmtp: !!nodeEnv && PRINTS_CODES.has(nodeEnv),
  };
}

function smtpConfigFrom(config: ConfigService): SmtpConfig | null {
  const host = config.get<string>('SMTP_HOST');
  if (!host) return null;
  const port = Number(config.get<string>('SMTP_PORT') ?? 587);
  return {
    host,
    port,
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS
    secure:
      (config.get<string>('SMTP_SECURE') ?? String(port === 465)) === 'true',
    user: config.get<string>('SMTP_USER') || undefined,
    pass: config.get<string>('SMTP_PASS') || undefined,
    from:
      config.get<string>('SMTP_FROM') ?? 'LibraFlow <no-reply@libraflow.local>',
  };
}

export function createSmtpTransport(smtp: SmtpConfig): MailTransport {
  return createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
}
