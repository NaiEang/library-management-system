import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

describe('GET /dashboard/stats (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the stat cards for an admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set(as(USERS.admin))
      .expect(200);
    expect(res.body.cards).toEqual({
      totalTitles: 3,
      totalCopies: 7,
      availableCopies: 2,
      onLoan: 3,
      overdue: 1,
      dueSoon: 1,
      pendingRequests: 1,
      returnedThisMonth: 1,
      activeMembers: 1,
      pendingDepositMembers: 1,
      blockedMembers: 1,
      totalMembers: 3,
      depositsHeld: 20,
      finesCollected30d: 0.75,
      depositsCollected30d: 10,
      accruingFines: 1.5,
    });
  });

  it('breaks copies and loan items down by status, leaving out rejected requests', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set(as(USERS.librarian))
      .expect(200);
    const byStatus = (rows: { status: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.status, row.count]));
    expect(byStatus(res.body.copiesByStatus)).toEqual({
      available: 2,
      borrowed: 3,
      reserved: 1,
      lost: 1,
    });
    expect(byStatus(res.body.loanItemsByStatus)).toEqual({
      borrowed: 2,
      overdue: 1,
      requested: 1,
      returned: 1,
    });
  });

  it('returns 30 days of loan activity and the top books and categories', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set(as(USERS.admin))
      .expect(200);
    const total = (key: 'requested' | 'borrowed' | 'returned') =>
      res.body.loanTrend.reduce(
        (sum: number, day: Record<string, number>) => sum + day[key],
        0,
      );
    expect(res.body.loanTrend).toHaveLength(30);
    expect([total('requested'), total('borrowed'), total('returned')]).toEqual([
      5, 4, 1,
    ]);

    expect(res.body.topBooks).toEqual([
      {
        bookId: '1',
        title: 'Alpha',
        authors: 'Ada Writer, Ben Author',
        loanCount: 2,
      },
      { bookId: '2', title: 'Beta', authors: 'Ben Author', loanCount: 2 },
    ]);
    expect(res.body.categoryUsage).toEqual([
      { category: 'Fiction', loanCount: 2 },
      { category: 'Science', loanCount: 2 },
    ]);
    expect(res.body.recentActivity[0]).toMatchObject({
      username: expect.any(String),
      description: expect.any(String),
    });
  });

  it('is closed to members and anonymous callers', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set(as(USERS.member))
      .expect(403);
    await request(app.getHttpServer()).get('/dashboard/stats').expect(401);
    // Inactive accounts are not resolved by the dev header at all
    await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set(as(USERS.inactiveMember))
      .expect(401);
  });
});
