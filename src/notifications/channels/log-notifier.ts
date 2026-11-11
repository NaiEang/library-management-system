import { Logger } from '@nestjs/common';
import type { Notifier, OutgoingMessage } from './notifier';

// Default channel when no SMTP server is configured: the message only goes
// to the application log, so the whole pipeline runs without credentials.
export class LogNotifier implements Notifier {
  readonly channel = 'log';
  private readonly logger = new Logger('Notifier');

  send(message: OutgoingMessage): Promise<void> {
    this.logger.log(
      `[${this.channel}] to user ${message.to.userId}: ${message.subject} - ${message.text}`,
    );
    return Promise.resolve();
  }
}
