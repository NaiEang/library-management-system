import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/auth/password/password.service';
import { insertRows } from '../src/database/insert-rows';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// Feature 8 against the real local test database: account status, staff
// password reset and self-service password change. These accounts (ids 9101+)
// are this file's own and are removed afterwards; the fixture admin is always
// re-enabled, so other test files never lose their admin.
const MINE = {
  admin2: 9101,
  librarian2: 9102,
  resetMe: 9103,
  changeMe: 9104,
  statusMe: 9105,
};
const PASSWORD = 'a long and unusual passphrase';
const ALL = Object.values(MINE);

describe('Account status, password reset and password change (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const today = new Date().toISOString().slice(0, 10);

  const login = (email: string, password: string) =>
    request(server()).post('/auth/login').send({ email, password });
  const activeSessions = async (userId: number) =>
    (
      await db.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      )
    )[0].n;
  const statusOf = async (userId: number) =>
    (
      await db.query<{ status: string }[]>(
        `SELECT status FROM users WHERE id = $1`,
        [userId],
      )
    )[0].status;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    const hash = await new PasswordService().hash(PASSWORD);
    const user = (id: number, roleId: number, username: string) => ({
      id,
      role_id: roleId,
      username,
      email: `${username}@test.local`,
      password_hash: hash,
      status: 'active',
    });
    await insertRows(db, 'users', [
      user(MINE.admin2, 1, 'second.admin'),
      user(MINE.librarian2, 2, 'desk.librarian'),
      user(MINE.resetMe, 3, 'reset.me'),
      user(MINE.changeMe, 3, 'change.me'),
      user(MINE.statusMe, 3, 'status.me'),
    ]);
    const member = (userId: number) => ({
      id: userId,
      user_id: userId,
      member_code: `LF-TEST-${userId}`,
      membership_date: today,
      membership_status: 'pending_deposit',
      deposit_amount: '0.00',
    });
    await insertRows(db, 'members', [
      member(MINE.resetMe),
      member(MINE.changeMe),
      member(MINE.statusMe),
    ]);
  });

  afterAll(async () => {
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [
      USERS.admin,
    ]);
    await db.query(
      `DELETE FROM activity_logs WHERE entity_id = ANY($1) OR user_id = ANY($2)`,
      [ALL.map(String), ALL],
    );
    await db.query(
      `DELETE FROM activity_logs WHERE entity_type = 'Password' AND user_id = $1`,
      [USERS.librarian],
    );
    await db.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ALL]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ALL]);
    await app?.close();
  });

  describe('PATCH /users/:id/status', () => {
    const setStatus = (
      id: number | string,
      enabled: unknown,
      actor?: number,
    ) => {
      const req = request(server())
        .patch(`/users/${id}/status`)
        .send({ enabled });
      return actor ? req.set(as(actor)) : req;
    };

    it.each([
      ['guest', undefined, 401],
      ['member', USERS.member, 403],
      ['librarian', USERS.librarian, 403],
    ])('%s → %i, and nothing changes', async (_label, actor, status) => {
      await setStatus(MINE.statusMe, false, actor).expect(status);
      expect(await statusOf(MINE.statusMe)).toBe('active');
    });

    it('admin disables a member: logged out everywhere, and the access token stops working at once', async () => {
      const session = await login('status.me@test.local', PASSWORD).expect(200);
      expect(await activeSessions(MINE.statusMe)).toBe(1);
      await request(server())
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .expect(200);

      const res = await setStatus(MINE.statusMe, false, USERS.admin).expect(
        200,
      );
      expect(res.body).toEqual({
        id: String(MINE.statusMe),
        username: 'status.me',
        role: 'member',
        status: 'disabled',
      });

      expect(await activeSessions(MINE.statusMe)).toBe(0);
      await request(server())
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .expect(401);
      await login('status.me@test.local', PASSWORD).expect(401);
    });

    it('is logged in the activity log', async () => {
      const [log] = await db.query(
        `SELECT description FROM activity_logs WHERE action = 'SET_ACCOUNT_STATUS' AND entity_id = $1`,
        [String(MINE.statusMe)],
      );
      expect(log.description).toBe(
        'admin changed the account status of User #9105 "status.me"',
      );
    });

    it('admin re-enables the account: the user can log in again', async () => {
      await setStatus(MINE.statusMe, true, USERS.admin).expect(200);
      await login('status.me@test.local', PASSWORD).expect(200);
    });

    it('an admin cannot change their own status → 403', async () => {
      await setStatus(USERS.admin, false, USERS.admin).expect(403);
      expect(await statusOf(USERS.admin)).toBe('active');
    });

    it('two admins can disable each other one at a time, but never both: one admin always remains', async () => {
      const results = await Promise.all([
        setStatus(MINE.admin2, false, USERS.admin),
        setStatus(USERS.admin, false, MINE.admin2),
      ]);
      expect(results.filter((res) => res.status === 200)).toHaveLength(1);
      const [{ n }] = await db.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM users WHERE role_id = 1 AND status = 'active'`,
      );
      expect(n).toBeGreaterThanOrEqual(1);
      await db.query(`UPDATE users SET status = 'active' WHERE id = ANY($1)`, [
        [USERS.admin, MINE.admin2],
      ]);
    });

    it.each([
      ['enabled missing', {}],
      ['enabled as a string', { enabled: 'false' }],
    ])('rejects a body with %s → 400', async (_label, body) => {
      await request(server())
        .patch(`/users/${MINE.statusMe}/status`)
        .set(as(USERS.admin))
        .send(body)
        .expect(400);
    });

    it('an unknown user → 404, a non-numeric id → 400', async () => {
      await setStatus(999999, false, USERS.admin).expect(404);
      await setStatus('abc', false, USERS.admin).expect(400);
    });
  });

  describe('POST /users/:id/reset-password', () => {
    const reset = (id: number, actor?: number) => {
      const req = request(server()).post(`/users/${id}/reset-password`);
      return actor ? req.set(as(actor)) : req;
    };

    it('guest → 401, member → 403', async () => {
      await reset(MINE.resetMe).expect(401);
      await reset(MINE.resetMe, USERS.member).expect(403);
    });

    it('librarian resets a member: the temporary password works, the old one and old sessions do not', async () => {
      await login('reset.me@test.local', PASSWORD).expect(200);
      const res = await reset(MINE.resetMe, USERS.librarian).expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        id: String(MINE.resetMe),
        username: 'reset.me',
        temporaryPassword: expect.stringMatching(/^[A-Za-z0-9_-]{12}$/),
      });
      expect(await activeSessions(MINE.resetMe)).toBe(0);
      await login('reset.me@test.local', PASSWORD).expect(401);
      await login('reset.me@test.local', res.body.temporaryPassword).expect(
        200,
      );

      const logs = await db.query<{ description: string }[]>(
        `SELECT description FROM activity_logs WHERE action = 'RESET_PASSWORD' AND entity_id = $1`,
        [String(MINE.resetMe)],
      );
      expect(logs[0].description).toBe(
        'librarian reset the password of User #9103 "reset.me"',
      );
      expect(JSON.stringify(logs)).not.toContain(res.body.temporaryPassword);
    });

    it.each([
      ['an admin', MINE.admin2],
      ['another librarian', MINE.librarian2],
    ])(
      'a librarian cannot reset %s → 403, and the password stays the same',
      async (_label, id) => {
        const hashOf = async () =>
          (
            await db.query<{ h: string }[]>(
              `SELECT password_hash AS h FROM users WHERE id = $1`,
              [id],
            )
          )[0].h;
        const before = await hashOf();
        await reset(id, USERS.librarian).expect(403);
        expect(await hashOf()).toBe(before);
      },
    );

    it('an admin can reset a librarian; nobody resets their own password this way', async () => {
      await reset(MINE.librarian2, USERS.admin).expect(201);
      await reset(USERS.admin, USERS.admin).expect(400);
    });
  });

  describe('PATCH /auth/password', () => {
    const change = (actor: number | undefined, body: object) => {
      const req = request(server()).patch('/auth/password').send(body);
      return actor ? req.set(as(actor)) : req;
    };
    const NEW = 'my fresh reading passphrase';

    it('guest → 401', async () => {
      await change(undefined, {
        currentPassword: PASSWORD,
        newPassword: NEW,
      }).expect(401);
    });

    it('a wrong current password → 400', async () => {
      const res = await change(MINE.changeMe, {
        currentPassword: 'not my password',
        newPassword: NEW,
      }).expect(400);
      expect(res.body.message).toBe('Current password is incorrect');
    });

    it('a weak new password → 400, and the old password still works', async () => {
      await change(MINE.changeMe, {
        currentPassword: PASSWORD,
        newPassword: 'password1',
      }).expect(400);
      await login('change.me@test.local', PASSWORD).expect(200);
    });

    it('success → 204: all sessions end, the new password works and the old one does not', async () => {
      expect(await activeSessions(MINE.changeMe)).toBeGreaterThan(0);
      await change(MINE.changeMe, {
        currentPassword: PASSWORD,
        newPassword: NEW,
      }).expect(204);
      expect(await activeSessions(MINE.changeMe)).toBe(0);
      await login('change.me@test.local', PASSWORD).expect(401);
      await login('change.me@test.local', NEW).expect(200);
    });

    it('the same password again → 400', async () => {
      await change(MINE.changeMe, {
        currentPassword: NEW,
        newPassword: NEW,
      }).expect(400);
    });

    it('a 6th attempt within 15 minutes → 429', async () => {
      // 4 counted so far (the guest's 401 is rejected before the rate limit counts it)
      await change(MINE.changeMe, {
        currentPassword: NEW,
        newPassword: 'x',
      }).expect(400);
      await change(MINE.changeMe, {
        currentPassword: NEW,
        newPassword: 'x',
      }).expect(429);
    });
  });
});
