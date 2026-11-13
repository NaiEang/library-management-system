import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EmailNotifier } from '../src/notifications/channels/email-notifier';
import { insertRows } from '../src/database/insert-rows';
import { localDataSource } from '../src/database/local-db';
import { as } from './setup/app';
import { USERS } from './setup/fixtures';
import { TEST_ENV } from './setup/test-env';

// Email verification against the real local test database: the one-statement
// send limits, the row lock on guesses, expiry and single use. These users are
// this file's own (ids 9101+) and are removed afterwards.
const MINE = {
  happy: 9101,
  wrong: 9102,
  dead: 9103,
  expired: 9104,
  replaced: 9105,
  daily: 9106,
  race: 9107,
  cooldown: 9108,
};

interface SentCode {
  userId: string;
  email: string;
  code: string;
}

describe('Email verification (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let sent: SentCode[];
  const server = () => app.getHttpServer();

  const sendCode = (userId: number) =>
    request(server()).post('/api/v1/auth/email/send-code').set(as(userId));
  const verify = (userId: number, code: string) =>
    request(server()).post('/api/v1/auth/email/verify').set(as(userId)).send({ code });
  const lastCode = (userId: number) =>
    sent.filter((s) => s.userId === String(userId)).at(-1)!.code;
  const codeRow = async (userId: number) =>
    (
      await db.query(
        `SELECT code_hash, attempts, send_count FROM email_verification_codes WHERE user_id = $1`,
        [userId],
      )
    )[0] as
      { code_hash: string; attempts: number; send_count: number } | undefined;
  const wrongCode = (code: string) =>
    String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  beforeAll(async () => {
    const setup = localDataSource(TEST_ENV.DATABASE_URL);
    await setup.initialize();
    const user = (id: number, username: string) => ({
      id,
      role_id: 3,
      username,
      email: `${username}@test.local`,
      password_hash: '!test',
      status: 'active',
    });
    await insertRows(
      setup,
      'users',
      Object.entries(MINE).map(([name, id]) => user(id, `verify.${name}`)),
    );
    // A member account needs its member row, or the guard refuses it.
    await insertRows(
      setup,
      'members',
      Object.values(MINE).map((id) => ({
        id,
        user_id: id,
        member_code: `LF-VERIFY-${id}`,
        membership_date: new Date().toISOString().slice(0, 10),
        expiry_date: null,
        membership_status: 'pending_deposit',
        deposit_amount: '0.00',
      })),
    );
    await setup.destroy();
  });

  // A fresh app per test: the per-IP throttler counts in memory, and this
  // file makes more requests than one IP may in an hour.
  beforeEach(async () => {
    sent = [];
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailNotifier)
      .useValue({
        sendVerificationCode: (
          to: { userId: string; email: string },
          code: string,
        ) => {
          sent.push({ userId: to.userId, email: to.email, code });
          return Promise.resolve();
        },
      })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<App>>({
        logger: false,
      }),
    );
    await app.init();
    db = app.get(DataSource);
  });

  afterEach(async () => {
    await app?.close();
  });

  afterAll(async () => {
    const cleanup = localDataSource(TEST_ENV.DATABASE_URL);
    await cleanup.initialize();
    const ids = Object.values(MINE);
    await cleanup.query(
      `DELETE FROM email_verification_codes WHERE user_id = ANY($1)`,
      [ids],
    );
    await cleanup.query(`DELETE FROM members WHERE user_id = ANY($1)`, [ids]);
    await cleanup.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await cleanup.query(
      `DELETE FROM users WHERE email = 'verified.librarian@test.local'`,
    );
    await cleanup.destroy();
  });

  it('guest → 401 on both routes', async () => {
    await request(server()).post('/api/v1/auth/email/send-code').expect(401);
    await request(server())
      .post('/api/v1/auth/email/verify')
      .send({ code: '123456' })
      .expect(401);
  });

  it('send, then verify: the email is verified, the code is gone, /auth/me says so', async () => {
    await sendCode(MINE.happy).expect(204);
    expect(sent).toEqual([
      {
        userId: String(MINE.happy),
        email: 'verify.happy@test.local',
        code: expect.stringMatching(/^\d{6}$/),
      },
    ]);
    const code = lastCode(MINE.happy);
    const row = await codeRow(MINE.happy);
    // Only the HMAC is stored, never the code.
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.code_hash).not.toContain(code);

    await verify(MINE.happy, code).expect(204);
    expect(await codeRow(MINE.happy)).toBeUndefined();
    const [user] = await db.query(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [MINE.happy],
    );
    expect(user.email_verified_at).toBeInstanceOf(Date);
    const me = await request(server())
      .get('/api/v1/auth/me')
      .set(as(MINE.happy))
      .expect(200);
    expect(me.body.emailVerified).toBe(true);
  });

  it('once verified: the same code, a new code and a new send all → 409', async () => {
    await verify(MINE.happy, '000000').expect(409);
    await sendCode(MINE.happy).expect(409);
    expect(sent).toEqual([]);
  });

  it('a wrong code → 400 with the tries left, counted in the database', async () => {
    await sendCode(MINE.wrong).expect(204);
    const res = await verify(
      MINE.wrong,
      wrongCode(lastCode(MINE.wrong)),
    ).expect(400);
    expect(res.body.message).toBe('Wrong code (4 tries left)');
    expect((await codeRow(MINE.wrong))?.attempts).toBe(1);
  });

  it.each(['12345', '1234567', 'abcdef', ' 12345'])(
    'rejects the malformed code "%s" with 400 before any check',
    async (code) => {
      await verify(MINE.wrong, code).expect(400);
      expect((await codeRow(MINE.wrong))?.attempts).toBe(1);
    },
  );

  it('5 wrong codes kill the code: even the right one is then refused', async () => {
    await sendCode(MINE.dead).expect(204);
    const code = lastCode(MINE.dead);
    for (let i = 0; i < 5; i++) {
      await verify(MINE.dead, wrongCode(code)).expect(400);
    }
    const res = await verify(MINE.dead, code).expect(400);
    expect(res.body.message).toMatch(/Too many wrong codes/);
    const [user] = await db.query(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [MINE.dead],
    );
    expect(user.email_verified_at).toBeNull();
  });

  it('parallel guesses are counted one by one: never more than 5', async () => {
    await sendCode(MINE.race).expect(204);
    const code = lastCode(MINE.race);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        verify(MINE.race, wrongCode(code)).then((res) => res.status),
      ),
    );
    expect(results.every((status) => status === 400)).toBe(true);
    expect((await codeRow(MINE.race))?.attempts).toBe(5);
  });

  it('an expired code is refused, even when it is right', async () => {
    await sendCode(MINE.expired).expect(204);
    await db.query(
      `UPDATE email_verification_codes SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
      [MINE.expired],
    );
    const res = await verify(MINE.expired, lastCode(MINE.expired)).expect(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it('a second send within a minute → 429 and no email', async () => {
    await sendCode(MINE.cooldown).expect(204);
    const res = await sendCode(MINE.cooldown).expect(429);
    expect(res.body.message).toMatch(/Please wait \d+ seconds/);
    expect(sent).toHaveLength(1);
  });

  it('after the cooldown a new code replaces the old one: the old one stops working', async () => {
    await sendCode(MINE.replaced).expect(204);
    const oldCode = lastCode(MINE.replaced);
    await db.query(
      `UPDATE email_verification_codes SET sent_at = now() - interval '61 seconds' WHERE user_id = $1`,
      [MINE.replaced],
    );
    await sendCode(MINE.replaced).expect(204);
    const newCode = lastCode(MINE.replaced);
    if (newCode !== oldCode) {
      await verify(MINE.replaced, oldCode).expect(400);
    }
    await verify(MINE.replaced, newCode).expect(204);
  });

  it('10 codes in 24 hours → 429 "tomorrow"; after the window it starts again at 1', async () => {
    await sendCode(MINE.daily).expect(204);
    await db.query(
      `UPDATE email_verification_codes
          SET send_count = 10, sent_at = now() - interval '2 minutes',
              send_window_started_at = now() - interval '1 hour'
        WHERE user_id = $1`,
      [MINE.daily],
    );
    const res = await sendCode(MINE.daily).expect(429);
    expect(res.body.message).toMatch(/tomorrow/);

    await db.query(
      `UPDATE email_verification_codes
          SET send_window_started_at = now() - interval '25 hours'
        WHERE user_id = $1`,
      [MINE.daily],
    );
    await sendCode(MINE.daily).expect(204);
    expect((await codeRow(MINE.daily))?.send_count).toBe(1);
  });

  it('a librarian created by an admin counts as verified', async () => {
    const created = await request(server())
      .post('/api/v1/users/librarians')
      .set(as(USERS.admin))
      .send({
        email: 'verified.librarian@test.local',
        username: 'verified.librarian',
        password: 'a long and unusual passphrase',
        firstName: 'Verified',
        lastName: 'Librarian',
      })
      .expect(201);
    const me = await request(server())
      .get('/api/v1/auth/me')
      .set(as(Number(created.body.id)))
      .expect(200);
    expect(me.body.emailVerified).toBe(true);
    await sendCode(Number(created.body.id)).expect(409);
  });
});
