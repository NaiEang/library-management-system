import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

function ctx(apiKey?: string): ExecutionContext {
  const request = { headers: apiKey !== undefined ? { 'x-api-key': apiKey } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(key: string | null = 'test-key-abc') {
  return new ApiKeyGuard({
    get: () => key,
  } as unknown as ConfigService);
}

describe('ApiKeyGuard', () => {
  it('allows a valid API key', () => {
    expect(guard().canActivate(ctx('test-key-abc'))).toBe(true);
  });

  it('rejects an invalid API key', () => {
    expect(() => guard().canActivate(ctx('wrong-key'))).toThrow(UnauthorizedException);
  });

  it('rejects a missing API key header', () => {
    expect(() => guard().canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('rejects when SHARED_SERVICE_API_KEY is not configured', () => {
    expect(() => guard(null).canActivate(ctx('any-key'))).toThrow(/not configured/);
  });

  it('uses timing-safe comparison (no early exit on length mismatch)', () => {
    expect(() => guard().canActivate(ctx('short'))).toThrow(UnauthorizedException);
    expect(() => guard().canActivate(ctx('test-key-abc-extra-long'))).toThrow(UnauthorizedException);
  });
});
