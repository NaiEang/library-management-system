import { COMMON_PASSWORDS } from './common-passwords';

// OWASP / NIST style: length and a blocklist, no composition rules.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const commonPasswords = new Set(COMMON_PASSWORDS);
// NIST also asks to block words specific to this service, and our own
// .env.example placeholders, even with digits or symbols added at the end.
const CONTEXT_WORDS = new Set([
  'libraflow',
  'library',
  'change-me',
  'changeme',
]);
const TRAILING_DIGITS_AND_SYMBOLS = /[\d\W_]+$/;

export interface PasswordContext {
  email?: string;
  username?: string;
}

// Returns the rules the password breaks; an empty array means it's accepted.
export function checkPasswordPolicy(
  password: string,
  context: PasswordContext = {},
): string[] {
  const problems: string[] = [];
  // Count Unicode code points (as NIST does), so an emoji is one character, not two.
  const length = Array.from(password).length;

  if (length < PASSWORD_MIN_LENGTH) {
    problems.push(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (length > PASSWORD_MAX_LENGTH) {
    problems.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }

  const candidate = password.trim().toLowerCase();
  const base = candidate.replace(TRAILING_DIGITS_AND_SYMBOLS, '');
  if (
    commonPasswords.has(candidate) ||
    CONTEXT_WORDS.has(candidate) ||
    CONTEXT_WORDS.has(base)
  ) {
    problems.push('Password is too common');
  }
  if (personalValues(context).includes(candidate)) {
    problems.push('Password must not be your email or username');
  }
  return problems;
}

function personalValues({ email, username }: PasswordContext): string[] {
  const values: string[] = [];
  if (email) {
    const normalized = email.trim().toLowerCase();
    values.push(normalized, normalized.split('@')[0]);
  }
  if (username) {
    values.push(username.trim().toLowerCase());
  }
  return values.filter((value) => value.length > 0);
}
