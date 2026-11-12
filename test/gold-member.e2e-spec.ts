import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { insertRows } from '../src/database/insert-rows';
import { addDays, addYears, libraryToday } from '../src/members/library-date';
import { MembershipService } from '../src/members/membership.service';
import {
  GoldClassTestController,
  GoldTestController,
} from './auth/fixtures/gold-test.controller';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// @GoldMember(), MembershipService.isGold() and the tier fields, against the
// real local test database. These rows are this file's own (ids 9301+) and
// are removed afterwards.
const MINE = {
  gold: 9301,
  never: 9302,
  ended: 9303,
  pending: 9304,
  membershipExpired: 9305,
  disabled: 9306,
  buyLater: 9307,
  expireLater: 9308,
  boundary: 9309,
  lastDay: 9310,
};

describe('@GoldMember() and the gold tier (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const today = libraryToday('Asia/Phnom_Penh');

  const get = (path: string, userId?: number) => {
    const req = request(server()).get(path);
    return userId ? req.set(as(userId)) : req;
  };
  const setGoldUntil = (userId: number, date: string | null) =>
    db.query(`UPDATE members SET gold_until = $1 WHERE user_id = $2`, [
      date,
      userId,
    ]);

  beforeAll(async () => {
    app = await createTestApp([GoldTestController, GoldClassTestController]);
    db = app.get(DataSource);
    const user = (id: number, status = 'active') => ({
      id,
      role_id: 3,
      username: `gm.${id}`,
      email: `gm.${id}@test.local`,
      password_hash: '!test',
      status,
      email_verified_at: new Date(),
    });
    await insertRows(db, 'users', [
      ...[
        MINE.gold,
        MINE.never,
        MINE.ended,
        MINE.pending,
        MINE.membershipExpired,
        MINE.buyLater,
        MINE.expireLater,
        MINE.boundary,
        MINE.lastDay,
      ].map((id) => user(id)),
      user(MINE.disabled, 'disabled'),
    ]);
    const member = (
      userId: number,
      overrides: Record<string, unknown> = {},
    ) => ({
      id: userId,
      user_id: userId,
      member_code: `LF-GM-${userId}`,
      membership_date: addDays(today, -60),
      expiry_date: addYears(addDays(today, -60), 1),
      membership_status: 'active',
      deposit_amount: '5.00',
      gold_until: null,
      ...overrides,
    });
    const soon = addDays(today, 30);
    await insertRows(db, 'members', [
      member(MINE.gold, { gold_until: soon }),
      member(MINE.never),
      member(MINE.ended, { gold_until: addDays(today, -1) }),
      member(MINE.pending, {
        membership_status: 'pending_deposit',
        expiry_date: null,
        deposit_amount: '0.00',
        gold_until: soon,
      }),
      member(MINE.membershipExpired, {
        membership_date: addDays(today, -400),
        expiry_date: addDays(today, -1),
        gold_until: soon,
      }),
      member(MINE.disabled, { gold_until: soon }),
      member(MINE.buyLater),
      member(MINE.expireLater, { gold_until: soon }),
      member(MINE.boundary, {
        expiry_date: '2040-01-01',
        gold_until: '2031-06-15',
      }),
      // Gold counts through its last day.
      member(MINE.lastDay, { gold_until: today }),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
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

  describe('the @GoldMember() guard on a test controller', () => {
    it('gold member → 200, and the route sees their member id', async () => {
      const res = await get('/gold-test/rooms', MINE.gold).expect(200);
      expect(res.body).toEqual({ ok: true, memberId: String(MINE.gold) });
    });

    it.each([
      ['a standard member (never gold)', MINE.never],
      ['a member whose gold ended yesterday', MINE.ended],
      ['a member with gold but no verified deposit', MINE.pending],
      ['a member with gold but an expired membership', MINE.membershipExpired],
      ['the seeded member (never bought gold)', USERS.member],
      ['the seeded pending member', USERS.pendingMember],
    ])('%s → 403 "Gold membership required"', async (_label, userId) => {
      const res = await get('/gold-test/rooms', userId).expect(403);
      expect(res.body.message).toBe('Gold membership required');
    });

    it('staff → 403, on the gold route and combined with @Roles', async () => {
      for (const staff of [USERS.librarian, USERS.admin]) {
        const res = await get('/gold-test/rooms', staff).expect(403);
        expect(res.body.message).toBe('Gold membership required');
      }
      await get('/gold-test/staff-and-gold', USERS.librarian).expect(403);
    });

    it('guest → 401, also on a route marked @Public() and @GoldMember()', async () => {
      await get('/gold-test/rooms').expect(401);
      await get('/gold-test/public-and-gold').expect(401);
      // @Public() skips authentication, so there is never a user to check:
      // even a gold member's token does not open it (fails closed).
      await get('/gold-test/public-and-gold', MINE.gold).expect(401);
    });

    it('a disabled account with gold time left → 401 (locked out at login check)', async () => {
      await get('/gold-test/rooms', MINE.disabled).expect(401);
    });

    it('gold still works on its last day', async () => {
      await get('/gold-test/rooms', MINE.lastDay).expect(200);
      const me = await get('/auth/me', MINE.lastDay).expect(200);
      expect(me.body.member).toMatchObject({ tier: 'gold', goldUntil: today });
    });

    it('routes without @GoldMember() are untouched: a standard member passes', async () => {
      await get('/gold-test/open', MINE.never).expect(200);
    });

    it('a controller-level @GoldMember() covers every route in it', async () => {
      await get('/gold-test-class/a', MINE.gold).expect(200);
      await get('/gold-test-class/b', MINE.gold).expect(200);
      await get('/gold-test-class/a', MINE.never).expect(403);
      await get('/gold-test-class/b', MINE.never).expect(403);
    });

    it('reads the database on every request: buying gold works at once, with the same token', async () => {
      const token = as(MINE.buyLater);
      await request(server()).get('/gold-test/rooms').set(token).expect(403);
      await request(server())
        .post(`/users/${MINE.buyLater}/gold-membership`)
        .set(as(USERS.librarian))
        .send({})
        .expect(201);
      await request(server()).get('/gold-test/rooms').set(token).expect(200);
    });

    it('reads the database on every request: gold that ends stops working at once, with the same token', async () => {
      const token = as(MINE.expireLater);
      await request(server()).get('/gold-test/rooms').set(token).expect(200);
      await setGoldUntil(MINE.expireLater, addDays(today, -1));
      const res = await request(server())
        .get('/gold-test/rooms')
        .set(token)
        .expect(403);
      expect(res.body.message).toBe('Gold membership required');
      // ...and renewing after it ended gives gold back.
      await request(server())
        .post(`/users/${MINE.expireLater}/gold-membership`)
        .set(as(USERS.librarian))
        .send({})
        .expect(201);
      await request(server()).get('/gold-test/rooms').set(token).expect(200);
    });
  });

  describe('MembershipService.isGold() at the Phnom Penh date boundary', () => {
    // gold_until 2031-06-15. Only Date is faked, so pg keeps its timers.
    const at = (iso: string) =>
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) });
    afterEach(() => vi.useRealTimers());
    const isGold = () =>
      app.get(MembershipService).isGold(String(MINE.boundary));

    it('gold at 23:59:59 Phnom Penh time on the last day (16:59:59 UTC)', async () => {
      at('2031-06-15T16:59:59Z');
      await expect(isGold()).resolves.toBe(true);
    });

    it('standard from 00:00 the next day in Phnom Penh (17:00 UTC), while UTC still says the 15th', async () => {
      at('2031-06-15T17:00:00Z');
      await expect(isGold()).resolves.toBe(false);
    });

    it('gold early on the last day in Phnom Penh, while UTC is still the 14th', async () => {
      at('2031-06-14T17:30:00Z');
      await expect(isGold()).resolves.toBe(true);
    });

    it('the guard follows the same boundary', async () => {
      at('2031-06-15T16:59:59Z');
      await get('/gold-test/rooms', MINE.boundary).expect(200);
      at('2031-06-15T17:00:00Z');
      await get('/gold-test/rooms', MINE.boundary).expect(403);
    });

    it('isGold() for the real members', async () => {
      const service = app.get(MembershipService);
      await expect(service.isGold(String(MINE.gold))).resolves.toBe(true);
      await expect(service.isGold(String(MINE.never))).resolves.toBe(false);
      await expect(service.isGold(String(MINE.ended))).resolves.toBe(false);
      await expect(service.isGold(String(MINE.pending))).resolves.toBe(false);
      await expect(service.isGold(String(MINE.disabled))).resolves.toBe(false);
      await expect(service.isGold('99999999')).resolves.toBe(false);
      await expect(service.isGold('1 OR 1=1')).resolves.toBe(false);
    });
  });

  describe('tier and goldUntil on /auth/me', () => {
    it('shows gold and the date for a gold member', async () => {
      const res = await get('/auth/me', MINE.gold).expect(200);
      expect(res.body.member).toMatchObject({
        tier: 'gold',
        goldUntil: addDays(today, 30),
      });
    });

    it('shows standard and no date for a member who was never gold', async () => {
      const res = await get('/auth/me', MINE.never).expect(200);
      expect(res.body.member).toMatchObject({
        tier: 'standard',
        goldUntil: null,
      });
    });

    it('shows standard (with the old date) once gold ended', async () => {
      const res = await get('/auth/me', MINE.ended).expect(200);
      expect(res.body.member).toMatchObject({
        tier: 'standard',
        goldUntil: addDays(today, -1),
      });
    });

    it('staff have no member part', async () => {
      const res = await get('/auth/me', USERS.librarian).expect(200);
      expect(res.body.member).toBeNull();
    });
  });

  describe('GET /users/members: tier, goldUntil and the tier filter', () => {
    const list = (query: string) =>
      get(`/users/members?search=gm.&limit=100&${query}`, USERS.librarian);
    // The guard tests above bought and expired gold for two members; put them
    // back so this block does not depend on their order.
    beforeAll(async () => {
      await setGoldUntil(MINE.buyLater, null);
      await setGoldUntil(MINE.expireLater, addDays(today, 30));
    });
    const ids = (body: { data: { userId: string }[] }) =>
      body.data.map((row) => Number(row.userId)).sort((a, b) => a - b);

    it('shows each row’s tier and goldUntil', async () => {
      const res = await list('').expect(200);
      const rows = res.body.data as {
        userId: string;
        tier: string;
        goldUntil: string | null;
      }[];
      const byId = (id: number) => rows.find((r) => r.userId === String(id));
      expect(byId(MINE.gold)).toMatchObject({
        tier: 'gold',
        goldUntil: addDays(today, 30),
      });
      expect(byId(MINE.never)).toMatchObject({
        tier: 'standard',
        goldUntil: null,
      });
      expect(byId(MINE.ended)).toMatchObject({
        tier: 'standard',
        goldUntil: addDays(today, -1),
      });
    });

    it('tier=gold lists only gold periods that have not ended', async () => {
      const res = await list('tier=gold').expect(200);
      expect(ids(res.body)).toEqual(
        [
          MINE.gold,
          MINE.pending,
          MINE.membershipExpired,
          MINE.disabled,
          MINE.expireLater,
          MINE.boundary,
          MINE.lastDay,
        ].sort((a, b) => a - b),
      );
    });

    it('tier=standard lists the rest, and the two filters never overlap', async () => {
      const gold = ids((await list('tier=gold').expect(200)).body);
      const standard = ids((await list('tier=standard').expect(200)).body);
      const all = ids((await list('').expect(200)).body);
      expect(standard).toEqual(
        [MINE.never, MINE.ended, MINE.buyLater].sort((a, b) => a - b),
      );
      expect(standard.filter((id) => gold.includes(id))).toEqual([]);
      expect([...gold, ...standard].sort((a, b) => a - b)).toEqual(all);
    });

    it('combines with the other filters', async () => {
      const res = await list(
        'tier=gold&membershipStatus=pending_deposit',
      ).expect(200);
      expect(ids(res.body)).toEqual([MINE.pending]);
    });

    it.each(['platinum', 'GOLD', '1', "gold' OR '1'='1", ''])(
      'rejects tier=%s with 400',
      async (value) => {
        await list(`tier=${encodeURIComponent(value)}`).expect(400);
      },
    );

    it('a member cannot use the list', async () => {
      await get('/users/members?tier=gold', MINE.gold).expect(403);
    });
  });
});
