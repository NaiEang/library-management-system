import {
  addDays,
  addYears,
  daysBetween,
  formatLibraryDate,
  isValidTimeZone,
  libraryToday,
  tierOf,
} from './library-date';

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

describe('addDays', () => {
  it.each([
    ['2026-11-12', 30, '2026-12-12'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('%s + %i days = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('tierOf', () => {
  it.each([
    ['2026-11-13', 'gold'],
    ['2026-11-12', 'gold'],
    ['2026-11-11', 'standard'],
    [null, 'standard'],
  ])('gold_until %s on 2026-11-12 → %s', (goldUntil, tier) => {
    expect(tierOf(goldUntil, '2026-11-12')).toBe(tier);
  });
});

describe('formatLibraryDate', () => {
  it('formats in the library calendar, not the server one', () => {
    // 2026-11-12 23:30 UTC is already Friday the 13th in Phnom Penh
    expect(
      formatLibraryDate('Asia/Phnom_Penh', new Date('2026-11-12T23:30:00Z')),
    ).toBe('Fri, 13 Nov 2026');
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days, across months and years', () => {
    expect(daysBetween('2026-11-09', '2026-11-12')).toBe(3);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-12', '2026-11-12')).toBe(0);
    expect(daysBetween('2026-11-12', '2026-11-09')).toBe(-3);
  });
});
