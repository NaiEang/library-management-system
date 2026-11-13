import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { MoreThan, Repository } from 'typeorm';
import {
  TelegramNotifier,
  type TelegramUpdate,
} from '../channels/telegram-notifier';
import { TelegramLink } from '../entities/telegram-link.entity';

// How long a link from POST /notifications/telegram/link can be used.
export const LINK_TTL_MINUTES = 15;

export const NOT_CONFIGURED = 'Telegram reminders are not set up';
export const UNREACHABLE =
  'Telegram is unreachable right now; try again in a minute';

// What the bot says (Telegram HTML mode; no user data in here).
export const BOT_REPLIES = {
  linked: [
    "✅ <b>You're all set!</b>",
    'Your LibraFlow account is now connected. I will message you:',
    '📚 the day before a book is due\n⏰ on the due date\n⚠️ if a book becomes overdue',
    'Send /stop any time to turn reminders off.',
  ].join('\n\n'),
  invalidLink: [
    '⌛ <b>This link has expired or was already used</b>',
    'Links work once, for 15 minutes. Please request a new Telegram link from your LibraFlow account and tap it again.',
  ].join('\n\n'),
  noLink: [
    '👋 <b>Welcome to LibraFlow!</b>',
    'I send reminders about the books you borrow, so you never miss a due date.',
    'To get started, open the Telegram link from your LibraFlow account.',
  ].join('\n\n'),
  unlinked: [
    '🔕 <b>Reminders turned off</b>',
    "You won't get LibraFlow reminders here any more. To turn them back on, open a new Telegram link from your LibraFlow account.",
  ].join('\n\n'),
};

// Telegram's command menu for the bot.
export const BOT_COMMANDS = [
  { command: 'stop', description: 'Turn off LibraFlow reminders' },
];

// /start, /start <token>, /start@SomeBot <token>
const START = /^\/start(?:@\S+)?(?:\s+(\S+))?\s*$/;
const STOP = /^\/stop(?:@\S+)?\s*$/;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

// Connects LibraFlow users to Telegram chats. The token in the link is
// random and single-use; only its SHA-256 is stored.
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger('TelegramLink');

  constructor(
    @InjectRepository(TelegramLink)
    private readonly links: Repository<TelegramLink>,
    private readonly telegram: TelegramNotifier,
  ) {}

  // A new link replaces the user's previous unused one.
  async createLink(
    userId: string,
    now = new Date(),
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!this.telegram.configured) {
      throw new ServiceUnavailableException(NOT_CONFIGURED);
    }
    // 24 random bytes = 32 base64url characters (Telegram allows up to 64)
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(now.getTime() + LINK_TTL_MINUTES * 60_000);
    // Usually cached since startup; if Telegram can't be reached, say so
    // rather than failing with a 500
    const username = await this.telegram.botUsername().catch((error: Error) => {
      this.logger.warn(`could not reach Telegram: ${error.message}`);
      throw new ServiceUnavailableException(UNREACHABLE);
    });
    await this.links.upsert(
      {
        userId,
        linkTokenHash: hashToken(token),
        linkTokenExpiresAt: expiresAt,
      },
      ['userId'],
    );
    return { url: `https://t.me/${username}?start=${token}`, expiresAt };
  }

  async status(userId: string): Promise<{ linked: boolean }> {
    const link = await this.links.findOne({ where: { userId } });
    return { linked: !!link?.chatId };
  }

  async unlink(userId: string): Promise<void> {
    await this.links.update({ userId }, { chatId: null, linkedAt: null });
  }

  // The chat linked to this user, if any (for sending reminders).
  async chatIdOf(userId: string): Promise<string | null> {
    const link = await this.links.findOne({ where: { userId } });
    return link?.chatId ?? null;
  }

  // One update from Telegram (see TelegramBotPoller).
  async handleUpdate(update: TelegramUpdate, now = new Date()): Promise<void> {
    const member = update.my_chat_member;
    if (member?.chat.type === 'private') {
      // The user blocked the bot: stop sending there
      if (member.new_chat_member.status === 'kicked') {
        await this.unlinkChat(String(member.chat.id));
      }
      return;
    }

    const message = update.message;
    // Private chats only: a group must never receive someone's reminders
    if (!message?.text || message.chat.type !== 'private') return;
    const chatId = String(message.chat.id);

    if (STOP.test(message.text)) {
      await this.unlinkChat(chatId);
      await this.telegram.sendHtml(chatId, BOT_REPLIES.unlinked);
      return;
    }
    const start = START.exec(message.text);
    if (!start) return;

    const token = start[1];
    if (!token) {
      await this.telegram.sendHtml(chatId, BOT_REPLIES.noLink);
      return;
    }
    const linked = await this.linkChat(token, chatId, now);
    await this.telegram.sendHtml(
      chatId,
      linked ? BOT_REPLIES.linked : BOT_REPLIES.invalidLink,
    );
  }

  private async linkChat(
    token: string,
    chatId: string,
    now: Date,
  ): Promise<boolean> {
    return this.links.manager.transaction(async (manager) => {
      const repo = manager.getRepository(TelegramLink);
      const link = await repo.findOne({
        where: {
          linkTokenHash: hashToken(token),
          linkTokenExpiresAt: MoreThan(now),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link) return false;
      // One chat, one account: the newest link wins
      await repo.update({ chatId }, { chatId: null, linkedAt: null });
      await repo.update(
        { userId: link.userId },
        {
          chatId,
          linkedAt: now,
          linkTokenHash: null,
          linkTokenExpiresAt: null,
        },
      );
      this.logger.log(`user ${link.userId} linked Telegram`);
      return true;
    });
  }

  private async unlinkChat(chatId: string): Promise<void> {
    await this.links.update({ chatId }, { chatId: null, linkedAt: null });
  }
}
