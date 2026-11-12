import { createHmac, hkdfSync, randomInt, timingSafeEqual } from 'node:crypto';

// The rules of a verification code. Fixed in code on purpose: they are
// security limits, not deployment settings.
export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS_PER_CODE = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
// At most 10 codes per user in 24 hours, so at most 50 guesses a day.
export const MAX_SENDS_PER_WINDOW = 10;
export const SEND_WINDOW_HOURS = 24;

export const CODE_PATTERN = /^\d{6}$/;

// 000000-999999 from the OS's secure random source (never Math.random).
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

// A key used only for codes, derived from the JWT secret with HKDF, so no new
// secret is needed and a code hash can't be confused with anything else.
export function deriveCodeKey(jwtSecret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      jwtSecret,
      Buffer.alloc(0),
      'libraflow email verification code v1',
      32,
    ),
  );
}

// HMAC, not a plain hash: there are only a million 6-digit codes, so a plain
// SHA-256 of one could be reversed in milliseconds from a database leak. The
// user id is part of the input, so a code is only valid for its own user.
export function hashCode(key: Buffer, userId: string, code: string): string {
  return createHmac('sha256', key).update(`${userId}:${code}`).digest('hex');
}

// Constant-time comparison of two hex hashes.
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
