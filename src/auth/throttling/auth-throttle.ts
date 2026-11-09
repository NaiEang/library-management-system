import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { normalizeEmail } from '../../users/normalize';

// Named throttlers, applied only where AuthThrottlerGuard is used:
// - ip: 10 requests per minute per client IP
// - email: 5 attempts per 15 minutes per account, whatever the IP, so a
//   botnet can't guess one account's password from many addresses.
// Routes without an email in the body (feature 4+) skip "email" with
// @SkipThrottle({ email: true }).
export const AUTH_THROTTLE_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'ip', ttl: 60_000, limit: 10 },
    {
      name: 'email',
      ttl: 15 * 60_000,
      limit: 5,
      getTracker: (req) => emailTracker(req),
    },
  ],
};

// Guards run before validation, so the body is still raw here.
export function emailTracker(req: Record<string, any>): string {
  const email: unknown = req.body?.email;
  if (typeof email === 'string' && email.trim() !== '') {
    return `email:${normalizeEmail(email).slice(0, 255)}`;
  }
  return `ip:${String(req.ip)}`;
}

// Register: 5 sign-ups per hour per IP. Applied with @Throttle on the route;
// the route skips the "email" throttler.
export const REGISTER_THROTTLE = { ip: { limit: 5, ttl: 60 * 60_000 } };
