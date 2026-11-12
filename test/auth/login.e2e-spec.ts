import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthAuditService } from '../../src/auth/audit/auth-audit.service';
import { RefreshToken } from '../../src/auth/entities/refresh-token.entity';
import { User } from '../../src/users/entities/user.entity';
import { FakeRepository } from './fixtures/fake-repository';
import { createTestApp, makeUser, PASSWORD } from './fixtures/test-app';

const HOUR = 3600;
const DAY = 24 * HOUR;

// One account per role, plus a disabled member.
const seedUsers = () =>
  Promise.all([
    makeUser({ id: '1', role: 'admin', email: 'admin@libraflow.test' }),
    makeUser({ id: '2', role: 'librarian', email: 'librarian@libraflow.test' }),
    makeUser({
      id: '3',
      role: 'member',
      email: 'good.student@demo.com',
      membershipStatus: 'pending_deposit',
    }),
    makeUser({
      id: '4',
      role: 'member',
      email: 'disabled@libraflow.test',
      status: 'disabled',
    }),
  ]);

describe('POST /auth/login and GET /auth/me (e2e)', () => {
  let app: INestApplication<App>;
  let users: FakeRepository<User>;
  let refreshTokens: FakeRepository<RefreshToken>;
  let audit: ReturnType<typeof vi.spyOn>;

  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('User-Agent', 'vitest')
      .send({ email, password });
  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get('/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const rawRefreshToken = (res: request.Response) =>
    String(res.body.refreshToken ?? '');
  const refreshLifetimeSeconds = (res: request.Response) =>
    Math.round(
      (Date.parse(res.body.refreshTokenExpiresAt) - Date.now()) / 1000,
    );

  // A fresh app per test: the throttler counts in memory, so tests stay independent.
  beforeEach(async () => {
    const testApp = await createTestApp(await seedUsers());
    ({ app, users, refreshTokens } = testApp);
    audit = vi.spyOn(app.get(AuthAuditService), 'record');
  });

  afterEach(async () => {
    await app.close();
  });

  describe('successful login, per role', () => {
    it.each([
      ['admin@libraflow.test', '1', 'admin', null, true],
      ['librarian@libraflow.test', '2', 'librarian', null, true],
      ['good.student@demo.com', '3', 'member', 'pending_deposit', false],
    ])(
      '%s → 200 with an access token and the user summary',
      async (email, id, role, membershipStatus, emailVerified) => {
        const res = await login(email).expect(200);
        expect(res.body).toEqual({
          accessToken: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
          refreshTokenExpiresAt: expect.any(String),
          user: {
            id,
            email,
            username: `user${id}`,
            role,
            membershipStatus,
            emailVerified,
          },
        });
      },
    );

    it('the access token works on GET /auth/me', async () => {
      const { body } = await login('librarian@libraflow.test').expect(200);
      const res = await me(body.accessToken).expect(200);
      expect(res.body).toMatchObject({
        id: '2',
        role: 'librarian',
        member: null,
      });
    });

    it('treats Good.Student@Demo.com and good.student@demo.com as the same account', async () => {
      const res = await login('  Good.Student@Demo.com ').expect(200);
      expect(res.body.user.id).toBe('3');
    });

    it('updates last_login_at', async () => {
      await login('good.student@demo.com').expect(200);
      expect(users.rows.find((u) => u.id === '3')?.lastLoginAt).toBeInstanceOf(
        Date,
      );
    });

    it('records a LOGIN_SUCCESS event without the password', async () => {
      await login('good.student@demo.com').expect(200);
      expect(audit).toHaveBeenCalledWith(
        'LOGIN_SUCCESS',
        expect.objectContaining({ userId: '3' }),
      );
      expect(JSON.stringify(audit.mock.calls)).not.toContain(PASSWORD);
    });
  });

  describe('refresh token (in the body: backend-only, no cookie)', () => {
    it('members: 43 characters, idle expiry in 7 days, and no cookie', async () => {
      const res = await login('good.student@demo.com').expect(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(rawRefreshToken(res)).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Math.abs(refreshLifetimeSeconds(res) - 7 * DAY)).toBeLessThan(5);
    });

    it('staff: capped by the 12h absolute limit', async () => {
      const res = await login('librarian@libraflow.test').expect(200);
      expect(Math.abs(refreshLifetimeSeconds(res) - 12 * HOUR)).toBeLessThan(5);
    });

    it('stores only the SHA-256 hash of the token, in a new family', async () => {
      const res = await login('good.student@demo.com').expect(200);
      const raw = rawRefreshToken(res);
      const [row] = refreshTokens.rows;
      expect(row.tokenHash).toBe(
        createHash('sha256').update(raw).digest('hex'),
      );
      expect(JSON.stringify(row)).not.toContain(raw);
      expect(row).toMatchObject({ userId: '3', userAgent: 'vitest' });
      expect(row.familyId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('uses a 30-day absolute limit for members and 12 hours for staff', async () => {
      const before = Date.now();
      await login('good.student@demo.com').expect(200);
      await login('admin@libraflow.test').expect(200);
      const [member, admin] = refreshTokens.rows;
      expect(
        member.absoluteExpiresAt.getTime() - before,
      ).toBeGreaterThanOrEqual(30 * DAY * 1000 - 5000);
      expect(member.absoluteExpiresAt.getTime() - before).toBeLessThanOrEqual(
        30 * DAY * 1000 + 5000,
      );
      expect(admin.absoluteExpiresAt.getTime() - before).toBeLessThanOrEqual(
        12 * HOUR * 1000 + 5000,
      );
    });
  });

  describe('failed login', () => {
    it.each([
      [
        'wrong password',
        'good.student@demo.com',
        'not the password',
        'wrong_password',
      ],
      ['unknown email', 'nobody@libraflow.test', PASSWORD, 'unknown_email'],
      [
        'disabled account, right password',
        'disabled@libraflow.test',
        PASSWORD,
        'disabled',
      ],
    ])(
      '%s → the same generic 401, no cookie, no session',
      async (_label, email, password, reason) => {
        const res = await login(email, password).expect(401);
        expect(res.body).toEqual({
          statusCode: 401,
          message: 'Invalid email or password',
          error: 'Unauthorized',
        });
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(refreshTokens.rows).toHaveLength(0);
        expect(audit).toHaveBeenCalledWith(
          'LOGIN_FAILURE',
          expect.objectContaining({ email, reason }),
        );
      },
    );

    it.each([
      [{ password: PASSWORD }],
      [{ email: 'not-an-email', password: PASSWORD }],
      [{ email: 'good.student@demo.com' }],
      [{ email: 'good.student@demo.com', password: 'x'.repeat(513) }],
    ])('rejects a malformed body %j with 400', async (body) => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(body)
        .expect(400);
    });
  });

  describe('rate limiting', () => {
    it('blocks a 6th attempt on the same email within 15 minutes, even with the right password', async () => {
      for (let i = 0; i < 5; i++) {
        await login('good.student@demo.com', 'wrong guess').expect(401);
      }
      await login('good.student@demo.com').expect(429);
    });

    it('counts the email limit across letter case', async () => {
      for (let i = 0; i < 5; i++) {
        await login(
          i % 2 ? 'GOOD.STUDENT@demo.com' : 'good.student@demo.com',
          'wrong guess',
        ).expect(401);
      }
      await login('Good.Student@Demo.com').expect(429);
    });

    it('blocks an 11th request per minute from one IP, across different emails', async () => {
      for (let i = 0; i < 10; i++) {
        await login(`guess${i}@libraflow.test`, 'wrong guess').expect(401);
      }
      await login('admin@libraflow.test').expect(429);
    });

    it('records a THROTTLE_HIT event', async () => {
      for (let i = 0; i < 5; i++) {
        await login('good.student@demo.com', 'wrong guess');
      }
      await login('good.student@demo.com').expect(429);
      expect(audit).toHaveBeenCalledWith(
        'THROTTLE_HIT',
        expect.objectContaining({
          route: 'POST /auth/login',
          tracker: 'email:good.student@demo.com',
        }),
      );
    });
  });

  describe('GET /auth/me', () => {
    it('guest → 401', () => me().expect(401));

    it('member → 200 with the member part as the entity is today', async () => {
      const { body } = await login('good.student@demo.com').expect(200);
      const res = await me(body.accessToken).expect(200);
      expect(res.body).toEqual({
        id: '3',
        email: 'good.student@demo.com',
        username: 'user3',
        firstName: 'Test',
        lastName: 'User3',
        phone: null,
        role: 'member',
        status: 'active',
        emailVerified: false,
        lastLoginAt: expect.any(String),
        member: {
          id: '30',
          memberCode: 'LF-2026-3',
          membershipStatus: 'pending_deposit',
          membershipDate: '2026-11-01',
          expiryDate: null,
          depositAmount: 0,
          depositVerifiedAt: null,
        },
      });
    });

    it('admin → 200 with role ADMIN and no member part', async () => {
      const { body } = await login('admin@libraflow.test').expect(200);
      await me(body.accessToken)
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({ role: 'admin', member: null });
        });
    });

    it('a user disabled after login → 401 on the next request', async () => {
      const { body } = await login('good.student@demo.com').expect(200);
      users.rows.find((u) => u.id === '3')!.status =
        'disabled' as User['status'];
      await me(body.accessToken).expect(401);
    });
  });

  it('no response contains a password or token hash, and only login returns the refresh token', async () => {
    const success = await login('good.student@demo.com').expect(200);
    const profile = await me(success.body.accessToken).expect(200);
    const failure = await login('good.student@demo.com', 'wrong guess').expect(
      401,
    );
    const raw = rawRefreshToken(success);
    for (const res of [success, profile, failure]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(
        /passwordHash|password_hash|\$argon2|tokenHash|token_hash/,
      );
    }
    expect(JSON.stringify(profile.body)).not.toContain(raw);
    expect(JSON.stringify(failure.body)).not.toContain(raw);
  });
});
