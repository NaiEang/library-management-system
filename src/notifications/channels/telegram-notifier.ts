import { Logger } from '@nestjs/common';
import { SIGN_OFF, type Notifier, type OutgoingMessage } from './notifier';
import type { TelegramConfig } from './telegram.config';

const API = 'https://api.telegram.org';

// Telegram's HTML mode: text from users or the database must be escaped
export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A reminder as Telegram shows it: icon and bold title, greeting, message,
// sign-off.
export function formatTelegramMessage(message: OutgoingMessage): string {
  const title = `<b>${escapeHtml(message.subject)}</b>`;
  return [
    message.icon ? `${message.icon} ${title}` : title,
    `Hi ${escapeHtml(message.to.name)},`,
    escapeHtml(message.text),
    `<i>${SIGN_OFF}</i>`,
  ].join('\n\n');
}

// The part of fetch the notifier uses (swapped for a fake in tests)
type Http = (url: string, init: RequestInit) => Promise<Response>;

// The parts of a Telegram update the bot reads.
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    text?: string;
  };
  // Sent when the user blocks the bot (status "kicked") or unblocks it.
  my_chat_member?: {
    chat: { id: number; type: string };
    new_chat_member: { status: string };
  };
}

export class TelegramApiError extends Error {
  constructor(
    readonly code: number,
    description: string,
  ) {
    super(`Telegram API error ${code}: ${description}`);
  }
}

// Reminders over the Telegram Bot API (send), plus the calls the bot itself
// needs (reply, read updates, its own username). A bot can only message
// users who pressed Start, so send() skips users without a linked chat.
export class TelegramNotifier implements Notifier {
  readonly channel = 'telegram';
  private readonly logger = new Logger('Notifier');
  private username?: Promise<string>;

  constructor(
    private readonly config: TelegramConfig,
    private readonly http: Http = fetch,
  ) {}

  get configured(): boolean {
    return this.config.botToken !== null;
  }

  async send(message: OutgoingMessage): Promise<void> {
    const chatId = message.to.telegramChatId;
    if (!chatId) return;
    try {
      await this.sendHtml(chatId, formatTelegramMessage(message));
    } catch (error) {
      // Blocked the bot (403) or the chat is gone (400): retrying can't help.
      // The link is cleared when Telegram tells the bot it was blocked.
      if (
        error instanceof TelegramApiError &&
        [400, 403].includes(error.code)
      ) {
        this.logger.warn(
          `user ${message.to.userId}: Telegram chat unreachable (${error.code}); skipped`,
        );
        return;
      }
      // A thrown error fails the job, and BullMQ retries it with backoff
      throw error;
    }
  }

  // html uses Telegram's HTML mode: escape anything not written by us
  async sendHtml(chatId: string | number, html: string): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }

  // The command menu Telegram shows next to the message box.
  async setCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<void> {
    await this.call('setMyCommands', { commands });
  }

  // The bot's @username, for t.me links. Asked once, then cached.
  botUsername(): Promise<string> {
    this.username ??= this.call<{ username: string }>('getMe', {}).then(
      (me) => me.username,
    );
    this.username.catch(() => (this.username = undefined));
    return this.username;
  }

  // Long polling: waits up to timeoutSeconds for new updates.
  getUpdates(
    offset: number,
    timeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ['message', 'my_chat_member'],
      },
      signal,
    );
  }

  private async call<T>(
    method: string,
    body: object,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.config.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    // The token is part of the URL, so it never goes into an error message
    const response = await this.http(
      `${API}/bot${this.config.botToken}/${method}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      error_code?: number;
      description?: string;
    };
    if (!data.ok) {
      throw new TelegramApiError(
        data.error_code ?? response.status,
        data.description ?? 'no description',
      );
    }
    return data.result as T;
  }
}
