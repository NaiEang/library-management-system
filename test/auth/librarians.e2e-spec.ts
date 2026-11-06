import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Member } from '../../src/members/entities/member.entity';
import { User } from '../../src/users/entities/user.entity';
import { FakeRepository } from './fixtures/fake-repository';
import { createTestApp, makeUser, PASSWORD } from './fixtures/test-app';

const librarian = {
  email: ' Desk.Librarian@LibraFlow.test ',
  username: 'Desk.Librarian',
  password: 'another long passphrase for the desk',
  firstName: 'Desk',
  lastName: 'Librarian',
};

describe('POST /users/librarians (e2e)', () => {
  let app: INestApplication<App>;
  let users: FakeRepository<User>;
  let members: FakeRepository<Member>;
  const tokens: Record<string, string> = {};

  const create = (body: object, token?: string) => {
    const req = request(app.getHttpServer())
      .post('/users/librarians')
      .send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  beforeEach(async () => {
    const seeded = await Promise.all([
      makeUser({ id: '1', role: 'ADMIN', email: 'admin@libraflow.test' }),
      makeUser({
        id: '2',
        role: 'LIBRARIAN',
        email: 'old.librarian@libraflow.test',
      }),
      makeUser({ id: '3', role: 'MEMBER', email: 'member@libraflow.test' }),
    ]);
    ({ app, users, members } = await createTestApp(seeded));
    for (const [role, email] of [
      ['ADMIN', 'admin@libraflow.test'],
      ['LIBRARIAN', 'old.librarian@libraflow.test'],
      ['MEMBER', 'member@libraflow.test'],
    ]) {
      tokens[role] = (await login(email).expect(200)).body
        .accessToken as string;
    }
  });

  afterEach(async () => {
    await app.close();
  });

  describe('permission matrix', () => {
    it('guest → 401', () => create(librarian).expect(401));
    it('member → 403', () => create(librarian, tokens.MEMBER).expect(403));
    it('librarian → 403', () =>
      create(librarian, tokens.LIBRARIAN).expect(403));
    it('admin → 201', () => create(librarian, tokens.ADMIN).expect(201));

    it('a refused request creates nothing', async () => {
      await create(librarian, tokens.LIBRARIAN).expect(403);
      expect(users.rows).toHaveLength(3);
    });
  });

  it('admin creates an active LIBRARIAN with normalized email and username, and no member row', async () => {
    const res = await create(librarian, tokens.ADMIN).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'desk.librarian@libraflow.test',
      username: 'desk.librarian',
      firstName: 'Desk',
      lastName: 'Librarian',
      phone: null,
      role: 'LIBRARIAN',
      status: 'active',
    });
    expect(users.rows.find((u) => u.id === res.body.id)).toMatchObject({
      roleId: 2,
      status: 'active',
    });
    expect(members.rows).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
  });

  it('the new librarian can log in, gets a 12-hour staff session, and reaches librarian-only routes', async () => {
    await create(librarian, tokens.ADMIN).expect(201);
    const res = await login(
      'desk.librarian@libraflow.test',
      librarian.password,
    ).expect(200);
    expect(res.body.user).toMatchObject({
      role: 'LIBRARIAN',
      membershipStatus: null,
    });
    expect(String(res.headers['set-cookie']?.[0])).toMatch(/Max-Age=43200/);
    // A librarian still can't create librarians.
    await create(
      { ...librarian, email: 'x@libraflow.test', username: 'xlib' },
      res.body.accessToken,
    ).expect(403);
  });

  it('ignores role, status and id from the client', async () => {
    const res = await create(
      { ...librarian, role: 'ADMIN', roleId: 1, status: 'disabled', id: '1' },
      tokens.ADMIN,
    ).expect(201);
    expect(res.body).toMatchObject({ role: 'LIBRARIAN', status: 'active' });
    expect(res.body.id).not.toBe('1');
    expect(users.rows.find((u) => u.id === res.body.id)).toMatchObject({
      roleId: 2,
      status: 'active',
    });
  });

  it.each([
    [
      'an email that exists, in another letter case',
      { email: 'MEMBER@libraflow.test' },
      'Email already registered',
    ],
    ['a username that exists', { username: 'user1' }, 'Username already taken'],
  ])('%s → 409', async (_label, override, message) => {
    const res = await create(
      { ...librarian, ...override },
      tokens.ADMIN,
    ).expect(409);
    expect(res.body.message).toBe(message);
    expect(users.rows).toHaveLength(3);
  });

  it.each([
    ['a common password', { password: 'password1' }, /too common/],
    [
      'the username as password',
      { password: 'Desk.Librarian' },
      /email or username/,
    ],
    ['a missing first name', { firstName: undefined }, /firstName/],
    ['a blank last name', { lastName: '   ' }, /lastName/],
    ['an invalid email', { email: 'nope' }, /email/],
  ])('%s → 400, nothing saved', async (_label, override, rule) => {
    const res = await create(
      { ...librarian, ...override },
      tokens.ADMIN,
    ).expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(rule);
    expect(users.rows).toHaveLength(3);
  });
});
