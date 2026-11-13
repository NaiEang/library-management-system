import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { insertRows } from '../src/database/insert-rows';
import { addDays, addYears, libraryToday } from '../src/members/library-date';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// Buying and renewing gold against the real local test database: the row lock,
// the payment row and the activity log. These rows are this file's own (ids
// 9201+) and are removed afterwards.
const MINE = {
  upgrade: 9201,
  renew: 9202,
  early: 9203,
  pending: 9204,
  unverified: 9205,
  race: 9206,
  khqr: 9207,
};

describe('Gold membership (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const today = libraryToday('Asia/Phnom_Penh');

  const buy = (userId: number, staff?: number, body: object = {}) => {
    const req = request(server())
      .post(`/api/v1/users/${userId}/gold-membership`)
      .send(body);
    return staff ? req.set(as(staff)) : req;
  };
  const goldUntil = async (userId: number) =>
    (
      await db.query(
        `SELECT gold_until::text AS gold_until FROM members WHERE user_id = $1`,
        [userId],
      )
    )[0].gold_until as string | null;
  const payments = (userId: number) =>
    db.query(
      `SELECT amount, payment_method, payment_type, status, payment_code, notes
         FROM payments WHERE member_id = $1 ORDER BY id`,
      [userId],
    ) as Promise<Record<string, string>[]>;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    const user = (id: number, verified = true) => ({
      id,
      role_id: 3,
      username: `gold.${id}`,
      email: `gold.${id}@test.local`,
      password_hash: '!test',
      status: 'active',
      email_verified_at: verified ? new Date() : null,
    });
    await insertRows(db, 'users', [
      user(MINE.upgrade),
      user(MINE.renew),
      user(MINE.early),
      user(MINE.pending),
      user(MINE.unverified, false),
      user(MINE.race),
      user(MINE.khqr),
    ]);
    const member = (
      userId: number,
      overrides: Record<string, unknown> = {},
    ) => ({
      id: userId,
      user_id: userId,
      member_code: `LF-GOLD-${userId}`,
      membership_date: addDays(today, -60),
      expiry_date: addYears(addDays(today, -60), 1),
      membership_status: 'active',
      deposit_amount: '5.00',
      gold_until: null,
      ...overrides,
    });
    await insertRows(db, 'members', [
      member(MINE.upgrade),
      member(MINE.renew, { gold_until: addDays(today, 10) }),
      member(MINE.early, { gold_until: addDays(today, 200) }),
      member(MINE.pending, {
        membership_status: 'pending_deposit',
        expiry_date: null,
        deposit_amount: '0.00',
      }),
      member(MINE.unverified),
      member(MINE.race),
      member(MINE.khqr),
    ]);
  });

  afterAll(async () => {
    const ids = Object.values(MINE);
    await db.query(
      `DELETE FROM activity_logs WHERE action = 'GOLD_MEMBERSHIP' AND entity_id = ANY($1)`,
      [ids.map(String)],
    );
    await db.query(`DELETE FROM payments WHERE member_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await app?.close();
  });

  it('guest → 401, member → 403, and nothing is charged', async () => {
    await buy(MINE.upgrade).expect(401);
    await buy(MINE.upgrade, USERS.member).expect(403);
    expect(await payments(MINE.upgrade)).toEqual([]);
    expect(await goldUntil(MINE.upgrade)).toBeNull();
  });

  it('librarian upgrades a standard member: gold for a year, one payment of the configured fee', async () => {
    const res = await buy(MINE.upgrade, USERS.librarian).expect(201);
    expect(res.body).toEqual({
      userId: String(MINE.upgrade),
      memberId: String(MINE.upgrade),
      memberCode: `LF-GOLD-${MINE.upgrade}`,
      tier: 'gold',
      goldUntil: addYears(today, 1),
      renewed: false,
      payment: {
        paymentCode: expect.stringMatching(/^GOLD-\d{4}-[A-Z2-7]{8}$/),
        amount: 5,
        paymentMethod: 'cash',
        paymentType: 'gold_membership',
      },
    });
    expect(await goldUntil(MINE.upgrade)).toBe(addYears(today, 1));
    expect(await payments(MINE.upgrade)).toEqual([
      {
        amount: '5.00',
        payment_method: 'cash',
        payment_type: 'gold_membership',
        status: 'completed',
        payment_code: res.body.payment.paymentCode,
        notes: `Gold membership until ${addYears(today, 1)}`,
      },
    ]);
  });

  it('is logged in the activity log with the member code', async () => {
    const [log] = await db.query(
      `SELECT user_id, description FROM activity_logs
        WHERE action = 'GOLD_MEMBERSHIP' AND entity_id = $1`,
      [String(MINE.upgrade)],
    );
    expect(log).toEqual({
      user_id: String(USERS.librarian),
      description: `librarian took the gold membership fee of User #${MINE.upgrade} "LF-GOLD-${MINE.upgrade}"`,
    });
  });

  it('a second click → 409 and still exactly one payment', async () => {
    const res = await buy(MINE.upgrade, USERS.admin).expect(409);
    expect(res.body.message).toMatch(/Already gold until/);
    expect(await payments(MINE.upgrade)).toHaveLength(1);
  });

  it('renews in the last 30 days from the current end', async () => {
    const res = await buy(MINE.renew, USERS.librarian).expect(201);
    expect(res.body).toMatchObject({
      goldUntil: addYears(addDays(today, 10), 1),
      renewed: true,
    });
    expect(await payments(MINE.renew)).toHaveLength(1);
  });

  it('refuses a renewal 200 days early → 409, nothing charged', async () => {
    await buy(MINE.early, USERS.librarian).expect(409);
    expect(await goldUntil(MINE.early)).toBe(addDays(today, 200));
    expect(await payments(MINE.early)).toEqual([]);
  });

  it.each([
    ['a pending deposit', MINE.pending, /verify the deposit first/],
    ['an unverified email', MINE.unverified, /email is not verified/],
  ])('%s → 409, nothing charged', async (_label, id, message) => {
    const res = await buy(id, USERS.librarian).expect(409);
    expect(res.body.message).toMatch(message);
    expect(await payments(id)).toEqual([]);
    expect(await goldUntil(id)).toBeNull();
  });

  it('records KHQR, and ignores an amount or date sent by the client', async () => {
    const res = await buy(MINE.khqr, USERS.librarian, {
      paymentMethod: 'khqr',
      amount: 0.01,
      goldUntil: '2099-12-31',
    }).expect(201);
    expect(res.body.goldUntil).toBe(addYears(today, 1));
    expect(await payments(MINE.khqr)).toEqual([
      expect.objectContaining({ amount: '5.00', payment_method: 'khqr' }),
    ]);
  });

  it.each([{ paymentMethod: 'bitcoin' }, { paymentMethod: 5 }])(
    'rejects the body %o with 400',
    async (body) => {
      await buy(MINE.pending, USERS.librarian, body).expect(400);
    },
  );

  it.each([
    ["a librarian's user id", USERS.librarian, 404],
    ['an id that does not exist', 999999, 404],
    ['a non-numeric id', 'abc', 400],
  ])('%s → %i', async (_label, id, status) => {
    await request(server())
      .post(`/api/v1/users/${id}/gold-membership`)
      .set(as(USERS.admin))
      .expect(status);
  });

  it('waits for a concurrent upgrade instead of charging twice', async () => {
    // A second connection plays the other staff member: it locks the row
    // first, then saves gold, while our request comes in.
    const other = db.createQueryRunner();
    await other.connect();
    await other.startTransaction();
    try {
      await other.query(
        `SELECT id FROM members WHERE user_id = $1 FOR UPDATE`,
        [MINE.race],
      );
      const pending = buy(MINE.race, USERS.librarian).then((res) => res.status);
      // The request must now be blocked on the row
      await new Promise((resolve) => setTimeout(resolve, 300));
      await other.query(
        `UPDATE members SET gold_until = $2 WHERE user_id = $1`,
        [MINE.race, addYears(today, 1)],
      );
      await other.commitTransaction();
      expect(await pending).toBe(409);
    } finally {
      if (other.isTransactionActive) await other.rollbackTransaction();
      await other.release();
    }
    expect(await payments(MINE.race)).toEqual([]);
    expect(await goldUntil(MINE.race)).toBe(addYears(today, 1));
  });
});
