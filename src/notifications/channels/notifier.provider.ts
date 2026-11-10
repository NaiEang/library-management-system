import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { LogNotifier } from './log-notifier';
import { NOTIFIER, type Notifier } from './notifier';

// Email once SMTP_HOST is set; otherwise messages only go to the log
export function createNotifier(config: ConfigService): Notifier {
  const host = config.get<string>('SMTP_HOST');
  if (!host) return new LogNotifier();

  const port = Number(config.get<string>('SMTP_PORT') ?? 587);
  return new EmailNotifier({
    host,
    port,
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS
    secure: (config.get<string>('SMTP_SECURE') ?? String(port === 465)) === 'true',
    user: config.get<string>('SMTP_USER') || undefined,
    pass: config.get<string>('SMTP_PASS') || undefined,
    from: config.get<string>('SMTP_FROM') ?? 'LibraFlow <no-reply@libraflow.local>',
  });
}

export const notifierProvider: Provider = {
  provide: NOTIFIER,
  inject: [ConfigService],
  useFactory: createNotifier,
};
