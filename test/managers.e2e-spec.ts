import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/auth/password/password.service';
import { insertRows } from '../src/database/insert-rows';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// The manager role against the real local test database: admin > manager >
// librarian. These accounts (ids 9301+) are this file's own and are removed
// afterwards.
const MINE = { manager: 9301, librarian: 9302, member: 9303, manager2: 9304 };
const ALL = Object.values(MINE);
const PASSWORD = 'a long and unusual passphrase';

const newStaff = (name: string) => ({
  email: `${name}@test.local`,
  username: name,
  password: 'quiet shelves at noon 42',
  firstName: 'New',
  lastName: 'Staff',
});

describe('Manager role (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const created: string[] = [];

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
      // Deposits need a verified email (part 4); this file tests roles.
      email_verified_at: new Date(),
    });
    await insertRows(db, 'users', [
      user(MINE.manager, 4, 'campus.manager'),
      user(MINE.librarian, 2, 'campus.librarian'),
      user(MINE.member, 3, 'campus.member'),
      user(MINE.manager2, 4, 'other.manager'),
    ]);
    await insertRows(db, 'members', [
      {
        id: MINE.member,
        user_id: MINE.member,
        member_code: `LF-TEST-${MINE.member}`,
        membership_date: new Date().toISOString().slice(0, 10),
        membership_status: 'pending_deposit',
        deposit_amount: '0.00',
      },
    ]);
  });

  afterAll(async () => {
    const ids = [...ALL, ...created.map(Number)];
    await db.query(
      `DELETE FROM activity_logs WHERE user_id = ANY($1) OR entity_id = ANY($2)`,
      [ids, ids.map(String)],
    );
    await db.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await app?.close();
  });

  describe('POST /users/managers (admins only)', () => {
    it.each([
      ['guest', undefined, 401],
      ['member', USERS.member, 403],
      ['librarian', USERS.librarian, 403],
      ['manager', MINE.manager, 403],
    ])('%s → %i', async (_label, actor, status) => {
      const req = request(server())
        .post('/users/managers')
        .send(newStaff('refused.manager'));
      await (actor ? req.set(as(actor)) : req).expect(status);
    });

    it('admin → 201: an active manager who can log in with a 12-hour staff session', async () => {
      const res = await request(server())
        .post('/users/managers')
        .set(as(USERS.admin))
        .send(newStaff('made.manager'))
        .expect(201);
      created.push(res.body.id);
      expect(res.body).toMatchObject({
        role: 'manager',
        status: 'active',
        username: 'made.manager',
      });
      const login = await request(server())
        .post('/auth/login')
        .send({
          email: 'made.manager@test.local',
          password: 'quiet shelves at noon 42',
        })
        .expect(200);
      expect(login.body.user.role).toBe('manager');
      const lifetime =
        (Date.parse(login.body.refreshTokenExpiresAt) - Date.now()) / 1000;
      expect(Math.abs(lifetime - 12 * 3600)).toBeLessThan(5);
    });
  });

  describe('what a manager can do', () => {
    it('create librarians (a librarian cannot)', async () => {
      await request(server())
        .post('/users/librarians')
        .set(as(USERS.librarian))
        .send(newStaff('nope.lib'))
        .expect(403);
      const res = await request(server())
        .post('/users/librarians')
        .set(as(MINE.manager))
        .send(newStaff('hired.by.manager'))
        .expect(201);
      created.push(res.body.id);
      expect(res.body.role).toBe('librarian');
    });

    it('use librarian routes: member list, dashboard, activity logs', async () => {
      await request(server())
        .get('/users/members')
        .set(as(MINE.manager))
        .expect(200);
      await request(server())
        .get('/dashboard/stats')
        .set(as(MINE.manager))
        .expect(200);
      await request(server())
        .get('/activity-logs?limit=1')
        .set(as(MINE.manager))
        .expect(200);
    });

    it('verify a deposit', async () => {
      const res = await request(server())
        .patch(`/users/${MINE.member}/verify-deposit`)
        .set(as(MINE.manager))
        .expect(200);
      expect(res.body.membershipStatus).toBe('active');
    });

    it.each([
      ['a librarian', MINE.librarian],
      ['a member', MINE.member],
    ])('disable, re-enable and reset %s', async (_label, id) => {
      await request(server())
        .patch(`/users/${id}/status`)
        .set(as(MINE.manager))
        .send({ enabled: false })
        .expect(200);
      await request(server())
        .patch(`/users/${id}/status`)
        .set(as(MINE.manager))
        .send({ enabled: true })
        .expect(200);
      await request(server())
        .post(`/users/${id}/reset-password`)
        .set(as(MINE.manager))
        .expect(201);
    });

    it("is recorded in B Panharith's activity log like other staff", async () => {
      const [{ n }] = await db.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM activity_logs WHERE user_id = $1`,
        [MINE.manager],
      );
      expect(n).toBeGreaterThan(0);
    });
  });

  describe("what a manager can't do (admin powers)", () => {
    it.each([
      ['another manager', MINE.manager2],
      ['an admin', USERS.admin],
    ])('disable or reset %s → 403, and nothing changes', async (_label, id) => {
      await request(server())
        .patch(`/users/${id}/status`)
        .set(as(MINE.manager))
        .send({ enabled: false })
        .expect(403);
      await request(server())
        .post(`/users/${id}/reset-password`)
        .set(as(MINE.manager))
        .expect(403);
      const [row] = await db.query<{ status: string }[]>(
        `SELECT status FROM users WHERE id = $1`,
        [id],
      );
      expect(row.status).toBe('active');
    });

    it('see the observability endpoints (admin only)', async () => {
      await request(server())
        .get('/observability/metrics')
        .set(as(MINE.manager))
        .expect(403);
      await request(server())
        .get('/observability/metrics')
        .set(as(USERS.admin))
        .expect(200);
    });

    it('a librarian still cannot reset or disable a manager', async () => {
      await request(server())
        .post(`/users/${MINE.manager2}/reset-password`)
        .set(as(USERS.librarian))
        .expect(403);
      await request(server())
        .patch(`/users/${MINE.manager2}/status`)
        .set(as(USERS.librarian))
        .send({ enabled: false })
        .expect(403);
    });

    it('an admin can disable and re-enable a manager', async () => {
      await request(server())
        .patch(`/users/${MINE.manager2}/status`)
        .set(as(USERS.admin))
        .send({ enabled: false })
        .expect(200);
      await request(server())
        .patch(`/users/${MINE.manager2}/status`)
        .set(as(USERS.admin))
        .send({ enabled: true })
        .expect(200);
    });
  });
});
