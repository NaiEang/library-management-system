import { Logger } from '@nestjs/common';
import {
  createDevCodeSender,
  DevConsoleCodeSender,
  NoEmailCodeSender,
} from './verification-code-sender';

const recipient = { userId: '12', email: 'a@b.test', name: 'A B' };

describe('createDevCodeSender', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['development', 'test'])(
    'prints codes only when NODE_ENV is explicitly %s',
    (env) => {
      expect(createDevCodeSender(env)).toBeInstanceOf(DevConsoleCodeSender);
    },
  );

  it.each(['production', 'staging', '', undefined])(
    'NODE_ENV=%s: never prints, and sending fails (fails closed)',
    async (env) => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const log = vi.spyOn(Logger.prototype, 'log');
      const sender = createDevCodeSender(env);
      expect(sender).toBeInstanceOf(NoEmailCodeSender);
      const error = await sender
        .sendVerificationCode(recipient, '042917', 15)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('042917');
      expect(warn).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );
});
