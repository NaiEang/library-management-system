import { randomBytes } from 'node:crypto';
import { validateAuthEnv } from './auth.config';

const goodSecret = randomBytes(48).toString('base64url');
const baseEnv = {
  JWT_ACCESS_SECRET: goodSecret,
  FRONTEND_ORIGIN: 'http://localhost:5173',
};

describe('validateAuthEnv', () => {
  it('applies the documented defaults and converts durations to seconds', () => {
    expect(validateAuthEnv(baseEnv)).toEqual({
      jwtAccessSecret: goodSecret,
      jwtAccessTtlSeconds: 900,
      refreshIdleTtlSeconds: 7 * 86400,
      refreshAbsoluteTtlMemberSeconds: 30 * 86400,
      refreshAbsoluteTtlStaffSeconds: 12 * 3600,
      frontendOrigin: 'http://localhost:5173',
      depositAmount: 5,
      goldMembershipFee: 5,
      libraryTimeZone: 'Asia/Phnom_Penh',
      memberEmailDomains: [],
    });
  });

  it('reads overrides from the environment', () => {
    const config = validateAuthEnv({
      ...baseEnv,
      JWT_ACCESS_TTL: '10m',
      DEPOSIT_AMOUNT: '7.5',
    });
    expect(config.jwtAccessTtlSeconds).toBe(600);
    expect(config.depositAmount).toBe(7.5);
  });

  it('needs only JWT_ACCESS_SECRET: FRONTEND_ORIGIN defaults (backend-only project)', () => {
    expect(
      validateAuthEnv({ JWT_ACCESS_SECRET: goodSecret }).frontendOrigin,
    ).toBe('http://localhost:5173');
  });

  it('rejects a missing secret', () => {
    expect(() =>
      validateAuthEnv({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a short secret', () => {
    expect(() =>
      validateAuthEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'a1b2c3d4e5f6' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects the placeholder from .env.example', () => {
    expect(() =>
      validateAuthEnv({
        ...baseEnv,
        JWT_ACCESS_SECRET: 'change-me-generate-a-random-secret',
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects a repetitive secret', () => {
    expect(() =>
      validateAuthEnv({ ...baseEnv, JWT_ACCESS_SECRET: 'ab'.repeat(20) }),
    ).toThrow(/repetitive/);
  });

  it('never echoes the secret value in the error', () => {
    const weak = 'tooShortButSecret';
    expect(() =>
      validateAuthEnv({ ...baseEnv, JWT_ACCESS_SECRET: weak }),
    ).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(weak) }),
    );
  });

  it.each([
    'localhost:5173',
    'http://localhost:5173/',
    'http://app.example.com/login',
    'ftp://example.com',
  ])('rejects FRONTEND_ORIGIN %s', (origin) => {
    expect(() =>
      validateAuthEnv({ ...baseEnv, FRONTEND_ORIGIN: origin }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  it.each(['15', '15 minutes', '-5m'])(
    'rejects the malformed duration %s',
    (ttl) => {
      expect(() =>
        validateAuthEnv({ ...baseEnv, JWT_ACCESS_TTL: ttl }),
      ).toThrow(/JWT_ACCESS_TTL/);
    },
  );

  it('rejects an access token lifetime over one hour', () => {
    expect(() => validateAuthEnv({ ...baseEnv, JWT_ACCESS_TTL: '2h' })).toThrow(
      /at most 1h/,
    );
  });

  it.each(['0', '-5', 'five'])('rejects DEPOSIT_AMOUNT %s', (amount) => {
    expect(() =>
      validateAuthEnv({ ...baseEnv, DEPOSIT_AMOUNT: amount }),
    ).toThrow(/DEPOSIT_AMOUNT/);
  });

  it('reads GOLD_MEMBERSHIP_FEE', () => {
    expect(
      validateAuthEnv({ ...baseEnv, GOLD_MEMBERSHIP_FEE: '6.50' })
        .goldMembershipFee,
    ).toBe(6.5);
  });

  it.each(['0', '-5', 'five', '5.001'])(
    'rejects GOLD_MEMBERSHIP_FEE %s',
    (fee) => {
      expect(() =>
        validateAuthEnv({ ...baseEnv, GOLD_MEMBERSHIP_FEE: fee }),
      ).toThrow(/GOLD_MEMBERSHIP_FEE/);
    },
  );

  it('accepts another IANA time zone', () => {
    expect(
      validateAuthEnv({ ...baseEnv, LIBRARY_TIME_ZONE: 'Asia/Bangkok' })
        .libraryTimeZone,
    ).toBe('Asia/Bangkok');
  });

  it.each(['Phnom Penh', 'UTC+7', 'Mars/Olympus'])(
    'rejects the time zone %s',
    (zone) => {
      expect(() =>
        validateAuthEnv({ ...baseEnv, LIBRARY_TIME_ZONE: zone }),
      ).toThrow(/LIBRARY_TIME_ZONE/);
    },
  );

  it('reads MEMBER_EMAIL_DOMAINS as a lowercase list', () => {
    expect(
      validateAuthEnv({
        ...baseEnv,
        MEMBER_EMAIL_DOMAINS: ' ITC.edu.kh , student.itc.edu.kh,',
      }).memberEmailDomains,
    ).toEqual(['itc.edu.kh', 'student.itc.edu.kh']);
  });

  it.each([
    '@itc.edu.kh',
    'itc',
    'itc..edu',
    '-itc.edu.kh',
    'itc.edu.kh/x',
    'user@itc.edu.kh',
  ])('rejects the domain list "%s"', (value) => {
    expect(() =>
      validateAuthEnv({ ...baseEnv, MEMBER_EMAIL_DOMAINS: value }),
    ).toThrow(/MEMBER_EMAIL_DOMAINS/);
  });
});
