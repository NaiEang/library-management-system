import { createHmac } from 'node:crypto';

// Hand-built JWTs, so the tests control every header and claim exactly.
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export function signToken(
  payload: object,
  secret: string,
  alg: 'HS256' | 'HS512' = 'HS256',
): string {
  const unsigned = `${encode({ alg, typ: 'JWT' })}.${encode(payload)}`;
  const hash = alg === 'HS256' ? 'sha256' : 'sha512';
  return `${unsigned}.${createHmac(hash, secret).update(unsigned).digest('base64url')}`;
}

export function unsignedToken(payload: object): string {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

export function decodePart(
  token: string,
  index: 0 | 1,
): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split('.')[index], 'base64url').toString(),
  ) as Record<string, unknown>;
}
