import type { NextFunction, Request, Response } from 'express';
import { queueDashboardAuth } from './queue-dashboard-auth';

function call(password: string, authorization?: string) {
  const res = {
    status: vi.fn(() => res),
    setHeader: vi.fn(() => res),
    send: vi.fn(() => res),
  };
  const next = vi.fn();
  queueDashboardAuth({ user: 'admin', password })(
    { headers: { authorization } } as Request,
    res as unknown as Response,
    next as NextFunction,
  );
  return { res, next };
}

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

describe('queueDashboardAuth', () => {
  it('hides the dashboard when no password is configured', () => {
    const { res, next } = call('', basic('admin', ''));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets the right credentials through', () => {
    expect(call('s3cret-pass', basic('admin', 's3cret-pass')).next).toHaveBeenCalled();
  });

  it.each([
    ['no credentials', undefined],
    ['a wrong password', basic('admin', 'nope')],
    ['a wrong user', basic('root', 's3cret-pass')],
    ['a bearer token', 'Bearer abc'],
  ])('asks for a login on %s', (_case, header) => {
    const { res, next } = call('s3cret-pass', header);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('Basic'));
    expect(next).not.toHaveBeenCalled();
  });
});
