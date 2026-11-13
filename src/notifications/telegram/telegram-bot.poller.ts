import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { TelegramNotifier } from '../channels/telegram-notifier';
import { telegramConfigFrom } from '../channels/telegram.config';
import { BOT_COMMANDS, TelegramLinkService } from './telegram-link.service';

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 5_000;

// Reads what users send the bot (/start <token>, /stop) by long polling, so
// it works locally and on any host without a public URL. Off when
// TELEGRAM_BOT_TOKEN is empty or TELEGRAM_POLLING=off.
@Injectable()
export class TelegramBotPoller
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('TelegramBot');
  private readonly enabled: boolean;
  private abort?: AbortController;
  private loop?: Promise<void>;

  constructor(
    private readonly telegram: TelegramNotifier,
    private readonly links: TelegramLinkService,
    config: ConfigService,
  ) {
    this.enabled = telegramConfigFrom(config).polling;
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    this.abort = new AbortController();
    this.loop = this.poll(this.abort.signal);
    // Remembered for t.me links, so creating one rarely needs Telegram
    this.telegram.botUsername().catch(() => {});
    // Not essential: the menu is cosmetic, so a failure is only logged
    this.telegram
      .setCommands(BOT_COMMANDS)
      .catch((error: Error) =>
        this.logger.warn(`could not set the command menu: ${error.message}`),
      );
    this.logger.log('listening for Telegram messages');
  }

  async onApplicationShutdown() {
    this.abort?.abort();
    await this.loop;
  }

  private async poll(signal: AbortSignal): Promise<void> {
    let offset = 0;
    while (!signal.aborted) {
      try {
        const updates = await this.telegram.getUpdates(
          offset,
          POLL_TIMEOUT_SECONDS,
          signal,
        );
        for (const update of updates) {
          // Moving the offset past an update tells Telegram it was handled
          offset = update.update_id + 1;
          await this.links
            .handleUpdate(update)
            .catch((error: Error) =>
              this.logger.error(
                `update ${update.update_id} failed: ${error.message}`,
              ),
            );
        }
      } catch (error) {
        if (signal.aborted) return;
        this.logger.warn(`polling failed: ${(error as Error).message}`);
        await sleep(RETRY_DELAY_MS, undefined, { signal }).catch(() => {});
      }
    }
  }
}
