import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { OVERDUE_QUEUE } from '../src/notifications/overdue/overdue.constants';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// The scan and the worker run for real against the test database and Redis
// (prefix bull-e2e); delivery goes to the log because SMTP_HOST is empty.
describe('Overdue reminders (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
    // Job ids are per item per day, so clear jobs left by an earlier run today
    await app.get<Queue>(getQueueToken(OVERDUE_QUEUE)).obliterate({ force: true });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is staff-only', async () => {
    await request(app.getHttpServer())
      .post('/notifications/overdue/scan')
      .set(as(USERS.member))
      .expect(403);
  });

  it('queues a reminder for the overdue item and the worker saves it in-app', async () => {
    const res = await request(app.getHttpServer())
      .post('/notifications/overdue/scan')
      .set(as(USERS.librarian))
      .expect(200);
    // Fixtures: item 2 is already overdue; the borrowed items are not due yet
    expect(res.body).toEqual({ marked: 0, queued: 1 });

    const db = app.get(DataSource);
    const rows = await vi.waitFor(
      async () => {
        const found = await db.query<{ user_id: string; type: string; message: string }[]>(
          `SELECT user_id, type, message FROM notifications WHERE type = 'LOAN_OVERDUE'`,
        );
        if (found.length === 0) throw new Error('not processed yet');
        return found;
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0].user_id)).toBe(String(USERS.member));
    expect(rows[0].message).toMatch(/is overdue\. You are blocked until you return it\.$/);
  });

  it('does not remind twice on the same day', async () => {
    await request(app.getHttpServer())
      .post('/notifications/overdue/scan')
      .set(as(USERS.admin))
      .expect(200);
    // Give a duplicate job time to run if one had been queued
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const [{ count }] = await app
      .get(DataSource)
      .query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM notifications WHERE type = 'LOAN_OVERDUE'`,
      );
    expect(count).toBe(1);
  });
});
