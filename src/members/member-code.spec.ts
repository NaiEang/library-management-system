import { generateMemberCode } from './member-code';

describe('generateMemberCode', () => {
  it('formats LF-<year>-<6 base32 characters>', () => {
    expect(generateMemberCode('2026')).toMatch(/^LF-2026-[A-Z2-7]{6}$/);
  });

  it('is random', () => {
    const codes = new Set(
      Array.from({ length: 200 }, () => generateMemberCode('2026')),
    );
    expect(codes.size).toBe(200);
  });
});
