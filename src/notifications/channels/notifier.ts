// Where an outgoing message is delivered (log, email, later Telegram).
// The in-app notification row is saved separately by the caller.
export const NOTIFIER = Symbol('NOTIFIER');

export interface OutgoingMessage {
  to: { userId: string; email: string | null; name: string };
  subject: string;
  text: string;
}

export interface Notifier {
  readonly channel: string;
  send(message: OutgoingMessage): Promise<void>;
}
