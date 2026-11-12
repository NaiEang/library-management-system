import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { emailConfigFrom } from './email.config';
import { LogNotifier } from './log-notifier';
import { NOTIFIER, type Notifier } from './notifier';

export function createEmailNotifier(config: ConfigService): EmailNotifier {
  return new EmailNotifier(emailConfigFrom(config));
}

// Email once SMTP_HOST is set; otherwise messages only go to the log
export function createNotifier(email: EmailNotifier): Notifier {
  return email.configured ? email : new LogNotifier();
}

// One EmailNotifier for the app: NOTIFIER reuses it when SMTP is set.
export const emailNotifierProvider: Provider = {
  provide: EmailNotifier,
  inject: [ConfigService],
  useFactory: createEmailNotifier,
};

export const notifierProvider: Provider = {
  provide: NOTIFIER,
  inject: [EmailNotifier],
  useFactory: createNotifier,
};
