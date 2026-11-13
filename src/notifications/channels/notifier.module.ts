import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailNotifier } from './email-notifier';
import { NOTIFIERS } from './notifier';
import {
  emailNotifierProvider,
  notifiersProvider,
  telegramNotifierProvider,
} from './notifier.provider';
import { TelegramNotifier } from './telegram-notifier';

// Delivery for Notifications (NOTIFIERS, TelegramNotifier for the bot) and
// Auth (EmailNotifier).
@Module({
  imports: [ConfigModule],
  providers: [
    emailNotifierProvider,
    telegramNotifierProvider,
    notifiersProvider,
  ],
  exports: [NOTIFIERS, EmailNotifier, TelegramNotifier],
})
export class NotifierModule {}
