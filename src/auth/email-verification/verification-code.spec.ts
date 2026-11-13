import {
  CODE_PATTERN,
  deriveCodeKey,
  generateCode,
  hashCode,
  hashesMatch,
} from './verification-code';

const key = deriveCodeKey('a-test-only-jwt-secret-with-enough-entropy-123');

describe('generateCode', () => {
  it('always gives exactly 6 digits, leading zeros kept', () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateCode()).toMatch(CODE_PATTERN);
    }
  });

  it('is not predictable: 2000 codes are mostly different', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateCode));
    expect(codes.size).toBeGreaterThan(1950);
  });
});

describe('hashCode', () => {
  it('is a 64-char hex HMAC, never the code itself', () => {
    const hash = hashCode(key, '12', '042917');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('042917');
  });

  it('is bound to the user: the same code hashes differently for another user', () => {
    expect(hashCode(key, '12', '042917')).not.toBe(
      hashCode(key, '13', '042917'),
    );
  });

  it('depends on the secret: another JWT secret gives another hash', () => {
    const otherKey = deriveCodeKey('another-test-only-secret-0987654321-xyz');
    expect(hashCode(key, '12', '042917')).not.toBe(
      hashCode(otherKey, '12', '042917'),
    );
  });

  it('is not the JWT secret itself (key separation)', () => {
    expect(key.toString('hex')).not.toContain(
      Buffer.from('a-test-only-jwt-secret').toString('hex'),
    );
  });
});

describe('hashesMatch', () => {
  const hash = hashCode(key, '12', '042917');

  it('accepts the same hash', () => {
    expect(hashesMatch(hashCode(key, '12', '042917'), hash)).toBe(true);
  });

  it('rejects a different code', () => {
    expect(hashesMatch(hashCode(key, '12', '042918'), hash)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    expect(hashesMatch('', hash)).toBe(false);
    expect(hashesMatch('zz', hash)).toBe(false);
  });
});
