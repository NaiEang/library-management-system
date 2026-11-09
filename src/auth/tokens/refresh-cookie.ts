import type { CookieSerializeOptions } from '@nestjs/common';

export const REFRESH_COOKIE = 'refresh_token';

// HttpOnly: JavaScript can't read it. SameSite=Strict + Path=/auth: the browser
// sends it only to our own /auth routes. maxAge is in seconds (Nest built-in).
export function refreshCookieOptions(
  expiresAt: Date,
  now = Date.now(),
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/auth',
    // Round up: the cookie must not expire before the session does; the
    // server still enforces expires_at itself.
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000)),
  };
}
