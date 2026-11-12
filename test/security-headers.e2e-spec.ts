import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './setup/app';

// app.useSecurityHeaders() in src/app.setup.ts: every response carries the
// standard security headers, errors included.
describe('Security headers (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['a normal response', '/api/v1', 200],
    ['a 401', '/api/v1/auth/me', 401],
    ['a 404', '/api/v1/no-such-route', 404],
    ['an operational endpoint outside /api/v1', '/health', 200],
  ])('%s carries them', async (_label, path, status) => {
    const res = await request(app.getHttpServer()).get(path).expect(status);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
