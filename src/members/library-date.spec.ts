import { addYears, isValidTimeZone, libraryToday } from './library-date';

describe('libraryToday', () => {
  const PHNOM_PENH = 'Asia/Phnom_Penh'; // UTC+7, no daylight saving

  it('returns YYYY-MM-DD in the given zone', () => {
    expect(libraryToday(PHNOM_PENH, new Date('2026-11-04T08:00:00Z'))).toBe(
      '2026-11-04',
    );
  });

  it('switches to the next day at midnight Phnom Penh time (17:00 UTC), not at midnight UTC', () => {
    expect(libraryToday(PHNOM_PENH, new Date('2026-11-04T16:59:59Z'))).toBe(
      '2026-11-04',
    );
    expect(libraryToday(PHNOM_PENH, new Date('2026-11-04T17:00:00Z'))).toBe(
      '2026-11-05',
    );
    expect(libraryToday('UTC', new Date('2026-11-04T17:00:00Z'))).toBe(
      '2026-11-04',
    );
  });

  it('handles year boundaries', () => {
    expect(libraryToday(PHNOM_PENH, new Date('2026-12-31T17:30:00Z'))).toBe(
      '2027-01-01',
    );
  });
});

describe('isValidTimeZone', () => {
  it.each(['Asia/Phnom_Penh', 'UTC', 'Europe/Paris'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['Phnom Penh', 'Mars/Olympus', ''])('rejects "%s"', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('addYears', () => {
  it.each([
    ['2026-11-09', '2027-11-09'],
    ['2026-12-31', '2027-12-31'],
    ['2028-02-29', '2029-02-28'],
    ['2027-02-28', '2028-02-28'],
  ])('%s + 1 year → %s', (date, expected) => {
    expect(addYears(date, 1)).toBe(expected);
  });

  it('keeps Feb 29 when the target year is a leap year', () => {
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });
});
