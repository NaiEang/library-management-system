import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { emailConfigFrom } from './email.config';
import { LogNotifier } from './log-notifier';
import { NOTIFIERS, type Notifier } from './notifier';
import { TelegramNotifier } from './telegram-notifier';
import { telegramConfigFrom } from './telegram.config';

export function createEmailNotifier(config: ConfigService): EmailNotifier {
  return new EmailNotifier(emailConfigFrom(config));
}

export function createTelegramNotifier(
  config: ConfigService,
): TelegramNotifier {
  return new TelegramNotifier(telegramConfigFrom(config));
}

// Reminder channels: email once SMTP_HOST is set (otherwise the log), plus
// Telegram once TELEGRAM_BOT_TOKEN is set.
export function createNotifiers(
  email: EmailNotifier,
  telegram: TelegramNotifier,
): Notifier[] {
  return [
    email.configured ? email : new LogNotifier(),
    ...(telegram.configured ? [telegram] : []),
  ];
}

// One instance of each for the app: NOTIFIERS reuses them.
export const emailNotifierProvider: Provider = {
  provide: EmailNotifier,
  inject: [ConfigService],
  useFactory: createEmailNotifier,
};

export const telegramNotifierProvider: Provider = {
  provide: TelegramNotifier,
  inject: [ConfigService],
  useFactory: createTelegramNotifier,
};

export const notifiersProvider: Provider = {
  provide: NOTIFIERS,
  inject: [EmailNotifier, TelegramNotifier],
  useFactory: createNotifiers,
};
