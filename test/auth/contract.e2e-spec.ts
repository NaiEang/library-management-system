import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { ContractTestModule } from './fixtures/contract-test.controller';
import { createTestApp, makeUser, TEST_SECRET } from './fixtures/test-app';
import { decodePart, signToken, unsignedToken } from './fixtures/tokens';

// The guard contract, end to end through the real AuthModule and UsersService.
// Only the repositories are fake, so no database is needed.
const SECRET = TEST_SECRET;
const now = () => Math.floor(Date.now() / 1000);

describe('Auth guard contract (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  // Signed by the app's own JwtService, so it uses the module's real settings.
  const tokenFor = (sub: string, role = 'member') => jwt.sign({ sub, role });
  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    const users = await Promise.all([
      makeUser({ id: '1', role: 'admin' }),
      makeUser({
        id: '2',
        username: 'user2',
        role: 'librarian',
      }),
      makeUser({
        id: '3',
        username: 'user3',
        role: 'member',
        memberId: '30',
      }),
      makeUser({ id: '4', role: 'member', status: 'disabled' }),
      makeUser({ id: '5', role: 'superuser' }),
      makeUser({ id: '6', role: 'admin' }),
      makeUser({ id: '7', role: 'member', memberId: null }),
    ]);
    const testApp = await createTestApp(users, [ContractTestModule]);
    // User 6 simulates a database failure during the lookup.
    testApp.users.failWhen = (where) =>
      !Array.isArray(where) && where.id === '6';
    app = testApp.app;
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('decorators', () => {
    it('@Public route: 200 without a token', () =>
      get('/api/v1/contract/public').expect(200, { ok: true }));

    it('route without decorators: 401 without a token', () =>
      get('/api/v1/contract/me').expect(401));

    it('@CurrentUser returns exactly { id, username, role, memberId }', () =>
      get('/api/v1/contract/me', tokenFor('3')).expect(200, {
        id: '3',
        username: 'user3',
        role: 'member',
        memberId: '30',
      }));

    it('@CurrentUser omits memberId for staff', () =>
      get('/api/v1/contract/me', tokenFor('2', 'librarian')).expect(200, {
        id: '2',
        username: 'user2',
        role: 'librarian',
      }));

    it.each([
      ['/api/v1/contract/admin', '1', 200],
      ['/api/v1/contract/admin', '2', 403],
      ['/api/v1/contract/admin', '3', 403],
      ['/api/v1/contract/staff', '1', 200],
      ['/api/v1/contract/staff', '2', 200],
      ['/api/v1/contract/staff', '3', 403],
    ])('%s as user %s → %i', async (path, sub, status) => {
      await get(path, tokenFor(sub)).expect(status);
    });

    it('role comes from the database: a MEMBER token claiming ADMIN gets 403', () =>
      get('/api/v1/contract/admin', tokenFor('3', 'admin')).expect(403));

    it('@Public plus @Roles fails closed, even with an admin token', () =>
      get('/api/v1/contract/public-with-roles', tokenFor('1')).expect(401));
  });

  describe('access token checks', () => {
    it('is signed with HS256 and lives 15 minutes, with only sub, role, iat and exp', () => {
      const token = tokenFor('3');
      expect(decodePart(token, 0)).toEqual({ alg: 'HS256', typ: 'JWT' });
      const claims = decodePart(token, 1);
      expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
      expect(Number(claims.exp) - Number(claims.iat)).toBe(900);
    });

    it('accepts a hand-built HS256 token with the right secret (sanity check for the cases below)', () =>
      get(
        '/api/v1/contract/me',
        signToken(
          { sub: '3', role: 'member', iat: now(), exp: now() + 60 },
          SECRET,
        ),
      ).expect(200));

    it('tampered payload → 401', () => {
      const [header, , signature] = tokenFor('3').split('.');
      const forged = Buffer.from(
        JSON.stringify({
          sub: '1',
          role: 'admin',
          iat: now(),
          exp: now() + 60,
        }),
      ).toString('base64url');
      return get('/api/v1/contract/me', `${header}.${forged}.${signature}`).expect(
        401,
      );
    });

    it('expired token → 401', () =>
      get(
        '/api/v1/contract/me',
        signToken(
          { sub: '3', role: 'member', iat: now() - 1000, exp: now() - 60 },
          SECRET,
        ),
      ).expect(401));

    it('alg "none" → 401', () =>
      get(
        '/api/v1/contract/me',
        unsignedToken({ sub: '1', role: 'admin', iat: now(), exp: now() + 60 }),
      ).expect(401));

    it('HS512 token signed with the right secret → 401 (algorithm pinned)', () =>
      get(
        '/api/v1/contract/me',
        signToken(
          { sub: '3', role: 'member', iat: now(), exp: now() + 60 },
          SECRET,
          'HS512',
        ),
      ).expect(401));

    it('token signed with a different secret → 401', () =>
      get(
        '/api/v1/contract/me',
        signToken(
          { sub: '3', role: 'member', iat: now(), exp: now() + 60 },
          randomBytes(48).toString('base64url'),
        ),
      ).expect(401));

    it('token without sub → 401', () =>
      get(
        '/api/v1/contract/me',
        signToken({ role: 'admin', iat: now(), exp: now() + 60 }, SECRET),
      ).expect(401));

    it.each([
      'Bearer',
      'Bearer not-a-jwt',
      `Basic ${Buffer.from('a:b').toString('base64')}`,
    ])('malformed Authorization header "%s" → 401', async (header) => {
      await request(app.getHttpServer())
        .get('/api/v1/contract/me')
        .set('Authorization', header)
        .expect(401);
    });
  });

  describe('user state is checked on every request', () => {
    it('disabled user with a still-valid token → 401', () =>
      get('/api/v1/contract/me', tokenFor('4')).expect(401));

    it('deleted user with a still-valid token → 401', () =>
      get('/api/v1/contract/me', tokenFor('99')).expect(401));

    it('user with an unknown role → 401', () =>
      get('/api/v1/contract/me', tokenFor('5')).expect(401));

    it('MEMBER without a member row → 401 (corrupt data fails closed)', () =>
      get('/api/v1/contract/me', tokenFor('7')).expect(401));

    it('database error during lookup → 401 (deny, never allow)', () =>
      get('/api/v1/contract/me', tokenFor('6')).expect(401));
  });

  it('401 responses are generic and leak nothing', async () => {
    const res = await get('/api/v1/contract/me', tokenFor('6'));
    expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });
});
