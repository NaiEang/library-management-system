import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { User } from '../../src/users/entities/user.entity';
import { FakeRepository } from './fixtures/fake-repository';
import { createTestApp, makeUser, PASSWORD } from './fixtures/test-app';

// MEMBER_EMAIL_DOMAINS=itc.edu.kh: members sign up with their school email,
// the identifier shared with Space Booking. Staff and existing accounts are
// not affected.
describe('POST /auth/register with MEMBER_EMAIL_DOMAINS (e2e)', () => {
  let app: INestApplication<App>;
  let users: FakeRepository<User>;
  const previous = process.env.MEMBER_EMAIL_DOMAINS;

  const register = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        username: email.split('@')[0].replace(/[^a-z0-9._-]/gi, ''),
        password: PASSWORD,
      });

  beforeAll(async () => {
    process.env.MEMBER_EMAIL_DOMAINS = 'itc.edu.kh';
    const seeded = await Promise.all([
      makeUser({ id: '1', role: 'admin', email: 'admin@libraflow.test' }),
      makeUser({ id: '2', role: 'member', email: 'old.member@gmail.com' }),
    ]);
    ({ app, users } = await createTestApp(seeded));
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.MEMBER_EMAIL_DOMAINS;
    else process.env.MEMBER_EMAIL_DOMAINS = previous;
  });

  it('a school email signs up (any letter case)', async () => {
    const res = await register('  Good.Student@ITC.edu.kh ').expect(201);
    expect(res.body).toMatchObject({
      email: 'good.student@itc.edu.kh',
      membershipStatus: 'pending_deposit',
    });
  });

  it.each([
    'someone@gmail.com',
    'someone@itc.edu.kh.evil.com',
    'someone@notitc.edu.kh',
  ])('%s → 400 with a clear message, nothing saved', async (email) => {
    const before = users.rows.length;
    const res = await register(email).expect(400);
    expect(res.body.message).toBe(
      'Please sign up with your school email (@itc.edu.kh)',
    );
    expect(users.rows).toHaveLength(before);
  });

  it('existing accounts with other emails can still log in', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'old.member@gmail.com', password: PASSWORD })
      .expect(200);
  });

  it('staff accounts are not restricted: an admin creates a librarian with any email', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@libraflow.test', password: PASSWORD })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/users/librarians')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        email: 'desk.librarian@gmail.com',
        username: 'desk.librarian',
        password: 'quiet shelves at noon 42',
        firstName: 'Desk',
        lastName: 'Librarian',
      })
      .expect(201);
  });
});
