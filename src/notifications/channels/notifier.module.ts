import { Module } from '@nestjs/common';
import { EmailNotifier } from './email-notifier';
import { NOTIFIER } from './notifier';
import { emailNotifierProvider, notifierProvider } from './notifier.provider';

// Delivery for Notifications (NOTIFIER) and Auth (EmailNotifier).
@Module({
  providers: [emailNotifierProvider, notifierProvider],
  exports: [NOTIFIER, EmailNotifier],
})
export class NotifierModule {}
