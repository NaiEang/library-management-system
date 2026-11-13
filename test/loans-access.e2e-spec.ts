import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// Who may call the loan and notification endpoints. Every request here is
// refused before it changes anything, so the shared fixtures stay intact.
describe('Loan and notification access (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['approve', 'return'])('does not let a member %s a loan', async (action) => {
    await request(app.getHttpServer())
      .patch(`/api/v1/loans/1/${action}`)
      .set(as(USERS.member))
      .expect(403);
  });

  it('does not let a member borrow on another member’s account', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/loans/request')
      .set(as(USERS.member))
      .send({ memberId: '2', bookCopyIds: ['1'] })
      .expect(403);
  });

  it('runs a member’s own request through the borrowing rules', async () => {
    // Member 1 has an overdue book in the fixtures, so the late block refuses it
    const res = await request(app.getHttpServer())
      .post('/api/v1/loans/request')
      .set(as(USERS.member))
      .send({ bookCopyIds: ['1'] })
      .expect(400);
    expect(res.body.message).toMatch(/overdue books/);
  });

  it('asks staff which member the loan is for', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/loans/request')
      .set(as(USERS.librarian))
      .send({ bookCopyIds: ['1'] })
      .expect(400);
  });

  it('lets staff act on loans', async () => {
    // No such loan, but getting that far means the role check let staff through
    const res = await request(app.getHttpServer())
      .patch('/api/v1/loans/999999/approve')
      .set(as(USERS.librarian))
      .expect(400);
    expect(res.body.message).toMatch(/pending loan not found/);
  });

  it('does not let a member create notifications', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set(as(USERS.member))
      .send({ userId: '4', title: 'Hi', message: 'Spam', type: 'LOAN_OVERDUE' })
      .expect(403);
  });
});
