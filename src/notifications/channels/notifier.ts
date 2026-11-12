export type Recipient = {
  userId: string;
  email: string | null;
  name: string;
  // Set once the user linked Telegram; the Telegram channel skips them otherwise.
  telegramChatId?: string | null;
};

// NOTIFIERS: every channel a reminder goes out on (email or log, plus
// Telegram when TELEGRAM_BOT_TOKEN is set). The in-app notification row is
// saved separately by the caller. Messages that must go by email, such as
// verification codes, use EmailNotifier directly instead.
export const NOTIFIERS = Symbol('NOTIFIERS');

// Every channel ends its messages with this.
export const SIGN_OFF = '— LibraFlow Library';

export interface OutgoingMessage {
  to: Recipient;
  subject: string;
  // Plain text; channels add their own greeting, formatting and sign-off
  text: string;
  // Optional emoji for channels that show one (Telegram)
  icon?: string;
}

export interface Notifier {
  readonly channel: string;
  send(message: OutgoingMessage): Promise<void>;
}
