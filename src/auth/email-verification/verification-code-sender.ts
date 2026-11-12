import { Logger, type Provider } from '@nestjs/common';

// The contract between Auth & Users (owns the code) and Notifications (owns
// the email). B Panhar implements VerificationCodeSender with his email
// notifier; until then the stand-ins below are used.
export const VERIFICATION_CODE_SENDER = Symbol('VERIFICATION_CODE_SENDER');

export interface VerificationCodeRecipient {
  userId: string;
  email: string;
  name: string;
}

export interface VerificationCodeSender {
  // Sends the code to recipient.email right away. Rules for implementers:
  // - never store the code (no notifications row, no activity log, no queue
  //   job data) and never log it;
  // - throw if the email can't be sent, so the user is told to try again.
  sendVerificationCode(
    recipient: VerificationCodeRecipient,
    code: string,
    expiresInMinutes: number,
  ): Promise<void>;
}

// Development only: writes the code to the console, so the flow can be tried
// locally without an email server. Chosen ONLY when NODE_ENV is explicitly
// "development" or "test" (see createDevCodeSender).
export class DevConsoleCodeSender implements VerificationCodeSender {
  private readonly logger = new Logger('DevVerificationCode');

  sendVerificationCode(
    recipient: VerificationCodeRecipient,
    code: string,
    expiresInMinutes: number,
  ): Promise<void> {
    this.logger.warn(
      `DEVELOPMENT ONLY: verification code for user ${recipient.userId} is ${code} (valid ${expiresInMinutes} min)`,
    );
    return Promise.resolve();
  }
}

// Everywhere else (production, or NODE_ENV not set): no email sender exists
// yet, so sending fails and nothing is printed. The code never leaves memory.
export class NoEmailCodeSender implements VerificationCodeSender {
  sendVerificationCode(): Promise<void> {
    return Promise.reject(
      new Error('No email sender for verification codes is configured'),
    );
  }
}

// Fails closed: only an explicit development or test environment prints codes.
const PRINTS_CODES = new Set(['development', 'test']);

export function createDevCodeSender(
  nodeEnv: string | undefined,
): VerificationCodeSender {
  return nodeEnv && PRINTS_CODES.has(nodeEnv)
    ? new DevConsoleCodeSender()
    : new NoEmailCodeSender();
}

// Replace with Notifications' real sender once it exists (one import line).
export const verificationCodeSenderProvider: Provider = {
  provide: VERIFICATION_CODE_SENDER,
  useFactory: () => createDevCodeSender(process.env.NODE_ENV),
};
