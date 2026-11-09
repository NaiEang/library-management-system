import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { insertRows } from '../src/database/insert-rows';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// Feature 7 against the real local test database. These rows are this file's
// own (ids 9001+) and are removed afterwards, so the shared fixtures, and the
// dashboard's exact numbers, stay untouched.
const MINE = {
  verify: 9001,
  disabled: 9002,
  percent: 9003,
  fiveHundred: 9004,
  race: 9005,
};

describe('Member list and deposit verification (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    const user = (id: number, username: string, status = 'active') => ({
      id,
      role_id: 3,
      username,
      email: `${username}@test.local`,
      password_hash: '!test',
      status,
    });
    await insertRows(db, 'users', [
      user(MINE.verify, 'verify.me'),
      user(MINE.disabled, 'disabled.pending', 'disabled'),
      user(MINE.percent, 'percent.member'),
      user(MINE.fiveHundred, 'five.hundred'),
      user(MINE.race, 'race.member'),
    ]);
    const member = (userId: number, code: string) => ({
      id: userId,
      user_id: userId,
      member_code: code,
      membership_date: today,
      expiry_date: null,
      membership_status: 'pending_deposit',
      deposit_amount: '0.00',
    });
    await insertRows(db, 'members', [
      member(MINE.verify, 'LF-TEST-9001'),
      member(MINE.disabled, 'LF-TEST-9002'),
      member(MINE.percent, 'LF-50%-X'),
      member(MINE.fiveHundred, 'LF-500-Y'),
      member(MINE.race, 'LF-TEST-9005'),
    ]);
  });

  afterAll(async () => {
    const ids = Object.values(MINE);
    await db.query(
      `DELETE FROM activity_logs WHERE action = 'VERIFY_DEPOSIT' AND entity_id = ANY($1)`,
      [ids.map(String)],
    );
    await db.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await app?.close();
  });

  describe('GET /users/members', () => {
    it.each([
      ['guest', undefined, 401],
      ['member', USERS.member, 403],
      ['librarian', USERS.librarian, 200],
      ['admin', USERS.admin, 200],
    ])('%s → %i', async (_label, userId, status) => {
      const req = request(server()).get('/users/members');
      await (userId ? req.set(as(userId)) : req).expect(status);
    });

    it('returns a page with the documented fields, and never blocked_until', async () => {
      const res = await request(server())
        .get('/users/members?search=verify.me')
        .set(as(USERS.librarian))
        .expect(200);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(res.body.data[0]).toEqual({
        userId: String(MINE.verify),
        memberId: String(MINE.verify),
        memberCode: 'LF-TEST-9001',
        email: 'verify.me@test.local',
        username: 'verify.me',
        firstName: null,
        lastName: null,
        accountStatus: 'active',
        membershipStatus: 'pending_deposit',
        depositAmount: 0,
        depositVerifiedAt: null,
        expiryDate: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/blocked|password/i);
    });

    it('filters by membership status', async () => {
      const res = await request(server())
        .get('/users/members?membershipStatus=pending_deposit&limit=100')
        .set(as(USERS.librarian))
        .expect(200);
      const rows = res.body.data as { membershipStatus: string }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every((row) => row.membershipStatus === 'pending_deposit'),
      ).toBe(true);
    });

    it('pages: limit 2 gives 2 rows and the full total', async () => {
      const res = await request(server())
        .get('/users/members?limit=2&page=1')
        .set(as(USERS.librarian))
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(8);
    });

    it('treats % and _ in the search as plain text', async () => {
      const percent = await request(server())
        .get('/users/members?search=50%25')
        .set(as(USERS.librarian))
        .expect(200);
      expect(
        percent.body.data.map((r: { memberCode: string }) => r.memberCode),
      ).toEqual(['LF-50%-X']);
      const underscore = await request(server())
        .get('/users/members?search=LF_5')
        .set(as(USERS.librarian))
        .expect(200);
      expect(underscore.body.meta.total).toBe(0);
    });

    it.each([
      'page=0',
      'limit=101',
      'limit=abc',
      'membershipStatus=blocked',
      `search=${'x'.repeat(101)}`,
    ])('rejects %s with 400', async (query) => {
      await request(server())
        .get(`/users/members?${query}`)
        .set(as(USERS.librarian))
        .expect(400);
    });
  });

  describe('PATCH /users/:id/verify-deposit', () => {
    const verify = (id: number | string, staff?: number) => {
      const req = request(server()).patch(`/users/${id}/verify-deposit`);
      return staff ? req.set(as(staff)) : req;
    };

    it('guest → 401, member → 403, and nothing changes', async () => {
      await verify(MINE.verify).expect(401);
      await verify(MINE.verify, USERS.member).expect(403);
      const [row] = await db.query(
        `SELECT membership_status FROM members WHERE user_id = $1`,
        [MINE.verify],
      );
      expect(row.membership_status).toBe('pending_deposit');
    });

    it('librarian verifies: active, deposit from config, who and when, expiry in a year', async () => {
      const res = await verify(MINE.verify, USERS.librarian).expect(200);
      expect(res.body).toMatchObject({
        userId: String(MINE.verify),
        membershipStatus: 'active',
        depositAmount: 5,
        depositVerifiedAt: expect.any(String),
      });
      const [row] = await db.query(
        `SELECT membership_status, deposit_amount, deposit_verified_by, expiry_date::text AS expiry
           FROM members WHERE user_id = $1`,
        [MINE.verify],
      );
      expect(row).toMatchObject({
        membership_status: 'active',
        deposit_amount: '5.00',
        deposit_verified_by: String(USERS.librarian),
      });
      expect(Number(row.expiry.slice(0, 4)) - Number(today.slice(0, 4))).toBe(
        1,
      );
    });

    it('is logged in the activity log as a deposit verification', async () => {
      const [log] = await db.query(
        `SELECT user_id, entity_type, entity_id, description FROM activity_logs
          WHERE action = 'VERIFY_DEPOSIT' AND entity_id = $1`,
        [String(MINE.verify)],
      );
      expect(log).toMatchObject({
        user_id: String(USERS.librarian),
        entity_type: 'User',
        entity_id: String(MINE.verify),
        description:
          'librarian verified the deposit of User #9001 "LF-TEST-9001"',
      });
    });

    it('the member now sees the active membership on /auth/me', async () => {
      const res = await request(server())
        .get('/auth/me')
        .set(as(MINE.verify))
        .expect(200);
      expect(res.body.member).toMatchObject({
        membershipStatus: 'active',
        depositAmount: 5,
      });
      expect(res.body.member.depositVerifiedAt).toEqual(expect.any(String));
    });

    it('verifying twice → 409', async () => {
      const res = await verify(MINE.verify, USERS.admin).expect(409);
      expect(res.body.message).toMatch(/already verified/);
    });

    it('a disabled account → 409, and stays pending', async () => {
      await verify(MINE.disabled, USERS.librarian).expect(409);
      const [row] = await db.query(
        `SELECT membership_status FROM members WHERE user_id = $1`,
        [MINE.disabled],
      );
      expect(row.membership_status).toBe('pending_deposit');
    });

    it.each([
      ["a librarian's user id", USERS.librarian, 404],
      ['an id that does not exist', 999999, 404],
      ['a non-numeric id', 'abc', 400],
    ])('%s → %i', async (_label, id, status) => {
      await verify(id, USERS.admin).expect(status);
    });

    it('waits for a concurrent verification instead of overwriting it', async () => {
      // A second connection plays the other librarian: it locks the row first
      const other = db.createQueryRunner();
      await other.connect();
      await other.startTransaction();
      try {
        await other.query(
          `SELECT id FROM members WHERE user_id = $1 FOR UPDATE`,
          [MINE.race],
        );
        const pending = verify(MINE.race, USERS.librarian).then(
          (res) => res.status,
        );
        // The request must now be blocked on the row lock
        await new Promise((resolve) => setTimeout(resolve, 300));
        await other.query(
          `UPDATE members SET membership_status = 'active', deposit_amount = 5, expiry_date = $2
            WHERE user_id = $1`,
          [MINE.race, today],
        );
        await other.commitTransaction();
        expect(await pending).toBe(409);
      } finally {
        if (other.isTransactionActive) await other.rollbackTransaction();
        await other.release();
      }
      const [row] = await db.query(
        `SELECT deposit_verified_by FROM members WHERE user_id = $1`,
        [MINE.race],
      );
      expect(row.deposit_verified_by).toBeNull();
    });
  });
});
