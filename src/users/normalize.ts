// Email is the identifier shared with Space Booking, so every write and lookup
// goes through this. The database also rejects emails that aren't normalized.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Usernames: 3–30 characters, lowercase letters, digits, dot, underscore, hyphen.
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
