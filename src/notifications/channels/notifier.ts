export type Recipient = { userId: string; email: string | null; name: string };

// NOTIFIER: tell a user something, over whatever channel is configured
// (log, email, later Telegram). The in-app notification row is saved
// separately by the caller. Messages that must go by email, such as
// verification codes, use EmailNotifier directly instead.
export const NOTIFIER = Symbol('NOTIFIER');

export interface OutgoingMessage {
  to: Recipient;
  subject: string;
  text: string;
}

export interface Notifier {
  readonly channel: string;
  send(message: OutgoingMessage): Promise<void>;
}
