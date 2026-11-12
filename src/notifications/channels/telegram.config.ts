import type { ConfigService } from '@nestjs/config';

export interface TelegramConfig {
  // From @BotFather; null when TELEGRAM_BOT_TOKEN is not set: Telegram is off.
  botToken: string | null;
  // Ask Telegram for new messages (/start from users) in the background.
  // Run it on exactly one instance: Telegram allows a single reader per bot.
  polling: boolean;
}

// Telegram settings from the environment (see .env.example)
export function telegramConfigFrom(config: ConfigService): TelegramConfig {
  const botToken = config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || null;
  return {
    botToken,
    polling: !!botToken && config.get<string>('TELEGRAM_POLLING') !== 'off',
  };
}
