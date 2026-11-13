import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Member } from '../../src/members/entities/member.entity';
import { User } from '../../src/users/entities/user.entity';
import { FakeRepository } from './fixtures/fake-repository';
import {
  createTestApp,
  makeUser,
  PASSWORD,
  type TestApp,
} from './fixtures/test-app';

const newMember = {
  email: '  New.Member@Demo.com ',
  username: 'NewMember',
  password: PASSWORD,
  firstName: ' New ',
  lastName: 'Member',
  phone: '+855 12 345 678',
};

describe('POST /auth/register (e2e)', () => {
  let app: INestApplication<App>;
  let users: FakeRepository<User>;
  let members: FakeRepository<Member>;
  let sentCodes: TestApp['sentCodes'];

  const register = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

  // A fresh app per test: the throttler counts in memory.
  beforeEach(async () => {
    const existing = await makeUser({
      id: '1',
      role: 'admin',
      email: 'taken@demo.com',
      username: 'takenname',
    });
    ({ app, users, members, sentCodes } = await createTestApp([existing]));
  });

  afterEach(async () => {
    await app.close();
  });

  it('guest → 201 with a MEMBER whose membership is pending_deposit, and no tokens', async () => {
    const res = await register(newMember).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'new.member@demo.com',
      username: 'newmember',
      role: 'member',
      membershipStatus: 'pending_deposit',
      emailVerified: false,
      verificationCodeSent: true,
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(
      /accessToken|passwordHash|argon2/,
    );
  });

  it('emails the first verification code to the new address, and never returns it', async () => {
    const res = await register(newMember).expect(201);
    expect(sentCodes).toEqual([
      {
        userId: res.body.id,
        email: 'new.member@demo.com',
        code: expect.stringMatching(/^\d{6}$/),
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(sentCodes[0].code);
  });

  it('a refused sign-up sends no code', async () => {
    await register({ ...newMember, email: 'taken@demo.com' }).expect(409);
    expect(sentCodes).toEqual([]);
  });

  it('stores a normalized user and a pending_deposit member row with no deposit', async () => {
    const { body } = await register(newMember).expect(201);
    const user = users.rows.find((u) => u.id === body.id)!;
    expect(user).toMatchObject({
      email: 'new.member@demo.com',
      username: 'newmember',
      firstName: 'New',
      lastName: 'Member',
      phone: '+855 12 345 678',
      roleId: 3,
      status: 'active',
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(members.rows).toHaveLength(1);
    expect(members.rows[0]).toMatchObject({
      userId: body.id,
      membershipStatus: 'pending_deposit',
      depositAmount: 0,
      expiryDate: null,
      memberCode: expect.stringMatching(/^LF-\d{4}-[A-Z2-7]{6}$/),
    });
  });

  it('the new account can log in, and /auth/me shows the pending membership', async () => {
    await register(newMember).expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'new.member@demo.com', password: PASSWORD })
      .expect(200);
    expect(login.body.user).toMatchObject({
      role: 'member',
      membershipStatus: 'pending_deposit',
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.member).toMatchObject({
      membershipStatus: 'pending_deposit',
      depositAmount: 0,
      expiryDate: null,
    });
  });

  it('ignores role, status, id, membership and deposit fields from the client', async () => {
    const { body } = await register({
      ...newMember,
      role: 'admin',
      roleId: 1,
      status: 'disabled',
      id: '1',
      membershipStatus: 'active',
      depositAmount: 100,
      depositVerifiedAt: '2026-01-01',
      expiryDate: '2099-01-01',
    }).expect(201);
    // Stripped by the whitelist (a 400 needs forbidNonWhitelisted in main.ts, still pending).
    expect(body).toMatchObject({
      role: 'member',
      membershipStatus: 'pending_deposit',
    });
    expect(body.id).not.toBe('1');
    expect(users.rows.find((u) => u.id === body.id)).toMatchObject({
      roleId: 3,
      status: 'active',
    });
    expect(members.rows[0]).toMatchObject({
      membershipStatus: 'pending_deposit',
      depositAmount: 0,
      expiryDate: null,
    });
    expect(users.rows.find((u) => u.id === '1')?.email).toBe('taken@demo.com');
  });

  describe('duplicates → 409', () => {
    it.each([
      [
        'the same email',
        { email: 'taken@demo.com' },
        'Email already registered',
      ],
      [
        'the same email in another letter case',
        { email: '  TAKEN@Demo.COM ' },
        'Email already registered',
      ],
      [
        'the same username in another letter case',
        { username: 'TakenName' },
        'Username already taken',
      ],
    ])('%s', async (_label, override, message) => {
      const res = await register({ ...newMember, ...override }).expect(409);
      expect(res.body.message).toBe(message);
      expect(members.rows).toHaveLength(0);
      expect(users.rows).toHaveLength(1);
    });
  });

  describe('validation → 400, nothing saved', () => {
    it.each([
      ['a password that is too short', { password: 'short1' }, /at least 8/],
      ['a common password', { password: 'password1' }, /too common/],
      [
        'the email as password',
        { password: 'New.Member@Demo.com' },
        /email or username/,
      ],
      ['an invalid email', { email: 'not-an-email' }, /email/],
      ['an invalid username', { username: 'a b' }, /username/],
      ['a too-short username', { username: 'ab' }, /username/],
      ['an invalid phone', { phone: 'call me maybe' }, /phone/],
      ['a missing password', { password: undefined }, /password/],
    ])('%s', async (_label, override, rule) => {
      const res = await register({ ...newMember, ...override }).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(rule);
      expect(users.rows).toHaveLength(1);
      expect(members.rows).toHaveLength(0);
    });
  });

  it('rolls back the user when the member row cannot be created', async () => {
    members.insert.mockRejectedValueOnce(new Error('members insert failed'));
    await register(newMember).expect(500);
    expect(users.rows).toHaveLength(1);
    expect(members.rows).toHaveLength(0);
  });

  it('allows 5 sign-ups per hour from one IP, then 429', async () => {
    for (let i = 0; i < 5; i++) {
      await register({
        ...newMember,
        email: `user${i}@demo.com`,
        username: `user${i}`,
      }).expect(201);
    }
    await register({
      ...newMember,
      email: 'user5@demo.com',
      username: 'user5',
    }).expect(429);
  });

  it('counts register and login separately', async () => {
    for (let i = 0; i < 5; i++) {
      await register({
        ...newMember,
        email: `user${i}@demo.com`,
        username: `user${i}`,
      }).expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user0@demo.com', password: PASSWORD })
      .expect(200);
  });
});
