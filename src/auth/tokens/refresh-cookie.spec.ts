import { refreshCookieOptions } from './refresh-cookie';

describe('refreshCookieOptions', () => {
  const now = Date.parse('2026-11-04T08:00:00Z');

  it('sets HttpOnly, Secure, SameSite=Strict and Path=/auth', () => {
    expect(refreshCookieOptions(new Date(now + 60_000), now)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
      maxAge: 60,
    });
  });

  it('gives maxAge in seconds, rounded up so the cookie never dies before the session', () => {
    expect(refreshCookieOptions(new Date(now + 59_001), now).maxAge).toBe(60);
  });

  it('never gives a negative maxAge', () => {
    expect(refreshCookieOptions(new Date(now - 5_000), now).maxAge).toBe(0);
  });
});
