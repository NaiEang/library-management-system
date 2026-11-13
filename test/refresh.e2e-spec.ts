import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/auth/password/password.service';
import { insertRows } from '../src/database/insert-rows';
import { createTestApp } from './setup/app';

// Feature 4 against the real local test database: refresh token rotation,
// reuse detection, expiry and logout. These accounts (ids 9201+) are this
// file's own and are removed afterwards.
const MINE = { member: 9201, disabledLater: 9202 };
const PASSWORD = 'a long and unusual passphrase';
const HOUR = 3600;
const DAY = 24 * HOUR;

describe('Refresh and logout (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();

  const login = (username: string) =>
    request(server())
      .post('/api/v1/auth/login')
      .send({ email: `${username}@test.local`, password: PASSWORD })
      .expect(200);
  const refresh = (refreshToken: unknown) =>
    request(server()).post('/api/v1/auth/refresh').send({ refreshToken });
  const logout = (refreshToken: unknown) =>
    request(server()).post('/api/v1/auth/logout').send({ refreshToken });
  const me = (accessToken: string) =>
    request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
  const rowOf = async (raw: string) =>
    (
      await db.query<
        {
          id: string;
          family_id: string;
          revoked_at: Date | null;
          replaced_by: string | null;
          expires_at: Date;
          absolute_expires_at: Date;
        }[]
      >(
        `SELECT id, family_id, revoked_at, replaced_by, expires_at, absolute_expires_at FROM refresh_tokens WHERE token_hash = $1`,
        [createHash('sha256').update(raw).digest('hex')],
      )
    )[0];

  // One app for setup and cleanup, and a fresh app per test: the rate limits
  // count in memory, so every test starts with fresh counters.
  let setupApp: INestApplication<App>;

  beforeAll(async () => {
    setupApp = await createTestApp();
    db = setupApp.get(DataSource);
    const hash = await new PasswordService().hash(PASSWORD);
    const user = (id: number, username: string) => ({
      id,
      role_id: 3,
      username,
      email: `${username}@test.local`,
      password_hash: hash,
      status: 'active',
    });
    await insertRows(db, 'users', [
      user(MINE.member, 'refresh.member'),
      user(MINE.disabledLater, 'refresh.disabled'),
    ]);
    await insertRows(
      db,
      'members',
      Object.values(MINE).map((id) => ({
        id,
        user_id: id,
        member_code: `LF-TEST-${id}`,
        membership_date: new Date().toISOString().slice(0, 10),
        membership_status: 'pending_deposit',
        deposit_amount: '0.00',
      })),
    );
  });

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    const ids = Object.values(MINE);
    await db.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await setupApp?.close();
  });

  it('rotation: a new pair, the same login session, a fresh idle limit, the same absolute end', async () => {
    const first = await login('refresh.member');
    const before = await rowOf(first.body.refreshToken);

    const res = await refresh(first.body.refreshToken).expect(200);
    expect(res.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      refreshTokenExpiresAt: expect.any(String),
    });
    expect(res.body.refreshToken).not.toBe(first.body.refreshToken);
    await me(res.body.accessToken).expect(200);

    const old = await rowOf(first.body.refreshToken);
    const next = await rowOf(res.body.refreshToken);
    expect(old.revoked_at).not.toBeNull();
    expect(old.replaced_by).toBe(next.id);
    expect(next.family_id).toBe(before.family_id);
    expect(next.absolute_expires_at.getTime()).toBe(
      before.absolute_expires_at.getTime(),
    );
    expect(next.expires_at.getTime() - Date.now()).toBeGreaterThan(
      7 * DAY * 1000 - 10_000,
    );
  });

  it('reuse of an already-used token → 401, and the whole session ends (the newer token too)', async () => {
    const first = await login('refresh.member');
    const second = await refresh(first.body.refreshToken).expect(200);

    await refresh(first.body.refreshToken).expect(401);

    const newest = await rowOf(second.body.refreshToken);
    expect(newest.revoked_at).not.toBeNull();
    await refresh(second.body.refreshToken).expect(401);
  });

  it('logout → 204, and the token no longer refreshes', async () => {
    const session = await login('refresh.member');
    await logout(session.body.refreshToken).expect(204);
    await refresh(session.body.refreshToken).expect(401);
  });

  it('logout ends only that login session, not the others', async () => {
    const laptop = await login('refresh.member');
    const phone = await login('refresh.member');
    await logout(laptop.body.refreshToken).expect(204);
    await refresh(phone.body.refreshToken).expect(200);
  });

  it('logout with an unknown token still answers 204 (reveals nothing)', async () => {
    await logout('z'.repeat(43)).expect(204);
  });

  it.each([
    ['the idle limit', 'expires_at'],
    ['the absolute limit', 'absolute_expires_at'],
  ])('a token past %s → 401', async (_label, column) => {
    const session = await login('refresh.member');
    await db.query(
      `UPDATE refresh_tokens SET ${column} = now() - interval '1 minute' WHERE token_hash = $1`,
      [createHash('sha256').update(session.body.refreshToken).digest('hex')],
    );
    await refresh(session.body.refreshToken).expect(401);
  });

  it('an account disabled after login gets no new token, and its session ends', async () => {
    const session = await login('refresh.disabled');
    // Set directly, without the revocation that PATCH /users/:id/status does
    await db.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [
      MINE.disabledLater,
    ]);
    await refresh(session.body.refreshToken).expect(401);
    expect((await rowOf(session.body.refreshToken)).revoked_at).not.toBeNull();
  });

  it('an unknown token → 401; a badly formed one → 400', async () => {
    await refresh('y'.repeat(43)).expect(401);
    await refresh('short').expect(400);
    await refresh(undefined).expect(400);
    await logout('short').expect(400);
  });

  it('the answers never reveal why a token was refused', async () => {
    const unknown = await refresh('x'.repeat(43)).expect(401);
    expect(unknown.body).toEqual({
      statusCode: 401,
      message: 'Invalid or expired refresh token',
      error: 'Unauthorized',
    });
  });
});
