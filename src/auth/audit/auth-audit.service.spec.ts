import { Logger } from '@nestjs/common';
import { AuthAuditService } from './auth-audit.service';

describe('AuthAuditService', () => {
  const log = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  const warn = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  afterEach(() => vi.clearAllMocks());

  it('writes one JSON line: info for success', () => {
    new AuthAuditService().record('LOGIN_SUCCESS', {
      userId: '3',
      ip: '127.0.0.1',
    });
    expect(log).toHaveBeenCalledWith(
      '{"event":"LOGIN_SUCCESS","userId":"3","ip":"127.0.0.1"}',
    );
  });

  it.each(['LOGIN_FAILURE', 'REFRESH_TOKEN_REUSE', 'THROTTLE_HIT'] as const)(
    'writes %s as a warning',
    (event) => {
      new AuthAuditService().record(event);
      expect(warn).toHaveBeenCalledWith(`{"event":"${event}"}`);
    },
  );

  it('keeps a crafted email on one line, so it cannot forge another log entry', () => {
    new AuthAuditService().record('LOGIN_FAILURE', {
      email: 'x@y.z\n[Nest] LOGIN_SUCCESS admin',
    });
    const line = warn.mock.calls[0][0] as string;
    expect(line).not.toContain('\n');
    expect(line).toContain('\\n');
  });
});
