import { randomBytes } from 'node:crypto';

// RFC 4648 base32: no 0/1/8/9, so codes read clearly at the desk.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// LF-<year>-<6 random base32 chars>, e.g. LF-2026-K7Q2XM. Random rather than
// sequential, so a code doesn't reveal how many members exist.
export function generateMemberCode(year: string): string {
  // 256 is a multiple of 32, so "byte % 32" has no bias.
  const suffix = Array.from(randomBytes(6), (byte) => ALPHABET[byte % 32]).join(
    '',
  );
  return `LF-${year}-${suffix}`;
}
