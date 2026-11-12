import { MembershipTier } from '../common/constants';

// The library's calendar date (YYYY-MM-DD) in its own time zone, so "today"
// doesn't depend on where the server runs (Supabase and many hosts use UTC).
export function libraryToday(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Adds whole days to a YYYY-MM-DD date (calendar arithmetic, no time zone).
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// Adds whole years to a YYYY-MM-DD date. Feb 29 becomes Feb 28 in a non-leap
// year, so a membership never ends in the following month.
export function addYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = year + years;
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const safeDay = month === 2 && day === 29 && !isLeap(target) ? 28 : day;
  return `${String(target).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

// The tier shown in responses, from the gold end date alone: gold while
// gold_until hasn't passed (it counts through that day), otherwise standard.
// Both are YYYY-MM-DD strings, so string order is date order. This is for
// display and filters; the access check is MembershipService.isGold(), which
// also needs the account and membership to be in good standing.
export function tierOf(
  goldUntil: string | null,
  today: string,
): MembershipTier {
  return goldUntil !== null && goldUntil >= today
    ? MembershipTier.GOLD
    : MembershipTier.STANDARD;
}
