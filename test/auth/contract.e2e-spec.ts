import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { AuthUserRecord, UsersService } from '../../src/users/users.service';
import { ContractTestModule } from './fixtures/contract-test.controller';
import { decodePart, signToken, unsignedToken } from './fixtures/tokens';

// The guard contract, end to end through real Nest wiring. The only fake is
// the user lookup, so no database is needed.
const users: Record<string, AuthUserRecord | Error> = {
  '1': { id: '1', status: 'active', roleName: 'ADMIN', memberId: null },
  '2': { id: '2', status: 'active', roleName: 'LIBRARIAN', memberId: null },
  '3': { id: '3', status: 'active', roleName: 'MEMBER', memberId: '30' },
  '4': { id: '4', status: 'disabled', roleName: 'MEMBER', memberId: '40' },
  '5': { id: '5', status: 'active', roleName: 'superuser', memberId: null },
  '6': new Error('connection refused'),
  '7': { id: '7', status: 'active', roleName: 'MEMBER', memberId: null },
};

const fakeUsersService = {
  findForAuth: (id: string) => {
    const user = users[id];
    return user instanceof Error
      ? Promise.reject(user)
      : Promise.resolve(user ?? null);
  },
};

@Module({
  providers: [{ provide: UsersService, useValue: fakeUsersService }],
  exports: [UsersService],
})
class FakeUsersModule {}

const SECRET = randomBytes(48).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

describe('Auth guard contract (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const savedEnv = { ...process.env };

  // Signed by the app's own JwtService, so it uses the module's real settings.
  const tokenFor = (sub: string, role = 'MEMBER') => jwt.sign({ sub, role });
  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        AuthModule,
        ContractTestModule,
      ],
    })
      .overrideModule(UsersModule)
      .useModule(FakeUsersModule)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    process.env = savedEnv;
  });

  describe('decorators', () => {
    it('@Public route: 200 without a token', () =>
      get('/contract/public').expect(200, { ok: true }));

    it('route without decorators: 401 without a token', () =>
      get('/contract/me').expect(401));

    it('@CurrentUser returns exactly { id, role, memberId }', () =>
      get('/contract/me', tokenFor('3')).expect(200, {
        id: '3',
        role: 'MEMBER',
        memberId: '30',
      }));

    it('@CurrentUser omits memberId for staff', () =>
      get('/contract/me', tokenFor('2', 'LIBRARIAN')).expect(200, {
        id: '2',
        role: 'LIBRARIAN',
      }));

    it.each([
      ['/contract/admin', '1', 200],
      ['/contract/admin', '2', 403],
      ['/contract/admin', '3', 403],
      ['/contract/staff', '1', 200],
      ['/contract/staff', '2', 200],
      ['/contract/staff', '3', 403],
    ])('%s as user %s → %i', async (path, sub, status) => {
      await get(path, tokenFor(sub)).expect(status);
    });

    it('role comes from the database: a MEMBER token claiming ADMIN gets 403', () =>
      get('/contract/admin', tokenFor('3', 'ADMIN')).expect(403));

    it('@Public plus @Roles fails closed, even with an admin token', () =>
      get('/contract/public-with-roles', tokenFor('1')).expect(401));
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
        '/contract/me',
        signToken(
          { sub: '3', role: 'MEMBER', iat: now(), exp: now() + 60 },
          SECRET,
        ),
      ).expect(200));

    it('tampered payload → 401', () => {
      const [header, , signature] = tokenFor('3').split('.');
      const forged = Buffer.from(
        JSON.stringify({
          sub: '1',
          role: 'ADMIN',
          iat: now(),
          exp: now() + 60,
        }),
      ).toString('base64url');
      return get('/contract/me', `${header}.${forged}.${signature}`).expect(
        401,
      );
    });

    it('expired token → 401', () =>
      get(
        '/contract/me',
        signToken(
          { sub: '3', role: 'MEMBER', iat: now() - 1000, exp: now() - 60 },
          SECRET,
        ),
      ).expect(401));

    it('alg "none" → 401', () =>
      get(
        '/contract/me',
        unsignedToken({ sub: '1', role: 'ADMIN', iat: now(), exp: now() + 60 }),
      ).expect(401));

    it('HS512 token signed with the right secret → 401 (algorithm pinned)', () =>
      get(
        '/contract/me',
        signToken(
          { sub: '3', role: 'MEMBER', iat: now(), exp: now() + 60 },
          SECRET,
          'HS512',
        ),
      ).expect(401));

    it('token signed with a different secret → 401', () =>
      get(
        '/contract/me',
        signToken(
          { sub: '3', role: 'MEMBER', iat: now(), exp: now() + 60 },
          randomBytes(48).toString('base64url'),
        ),
      ).expect(401));

    it('token without sub → 401', () =>
      get(
        '/contract/me',
        signToken({ role: 'ADMIN', iat: now(), exp: now() + 60 }, SECRET),
      ).expect(401));

    it.each([
      'Bearer',
      'Bearer not-a-jwt',
      `Basic ${Buffer.from('a:b').toString('base64')}`,
    ])('malformed Authorization header "%s" → 401', async (header) => {
      await request(app.getHttpServer())
        .get('/contract/me')
        .set('Authorization', header)
        .expect(401);
    });
  });

  describe('user state is checked on every request', () => {
    it('disabled user with a still-valid token → 401', () =>
      get('/contract/me', tokenFor('4')).expect(401));

    it('deleted user with a still-valid token → 401', () =>
      get('/contract/me', tokenFor('99')).expect(401));

    it('user with an unknown role → 401', () =>
      get('/contract/me', tokenFor('5')).expect(401));

    it('MEMBER without a member row → 401 (corrupt data fails closed)', () =>
      get('/contract/me', tokenFor('7')).expect(401));

    it('database error during lookup → 401 (deny, never allow)', () =>
      get('/contract/me', tokenFor('6')).expect(401));
  });

  it('401 responses are generic and leak nothing', async () => {
    const res = await get('/contract/me', tokenFor('6'));
    expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });
});
