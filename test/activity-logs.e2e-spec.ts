import {
  Controller,
  INestApplication,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { LogActivity } from '../src/dashboard/decorators/log-activity.decorator';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

// Stands in for handlers other modules will write, to pin down what @LogActivity does
@Controller('probe-loans')
class ProbeController {
  // A plain write with no @LogActivity, for checking who gets logged
  @Post()
  create() {
    return { id: '1' };
  }

  @Patch(':id/approve')
  @LogActivity({ action: 'APPROVE', entityType: 'Loan' })
  approve(@Param('id') id: string) {
    return { id, loanCode: `LN-${id}` };
  }

  @Post('login')
  @LogActivity({ skip: true })
  login() {
    return { ok: true };
  }
}

// A write whose handler returns no id (the old scaffold PATCH /members/:id is gone)
@Controller('members')
class ProbeMembersController {
  @Patch(':id')
  update() {
    return { ok: true };
  }
}

type LogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
};

describe('Activity logs (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  const server = () => app.getHttpServer();
  const count = async () =>
    (
      await db.query<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM activity_logs`,
      )
    )[0].n;
  const latest = async () =>
    (
      await request(server())
        .get('/activity-logs?limit=1')
        .set(as(USERS.admin))
        .expect(200)
    ).body.data[0] as LogRow;

  beforeAll(async () => {
    app = await createTestApp([ProbeController, ProbeMembersController]);
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('ActivityLogInterceptor', () => {
    it('records a librarian write with the action, entity, user and IP', async () => {
      await request(server())
        .post('/books')
        .set(as(USERS.librarian))
        .send({})
        .expect(201);
      const res = await request(server())
        .get('/activity-logs?limit=1')
        .set(as(USERS.admin))
        .expect(200);
      expect(res.body.data[0]).toMatchObject({
        action: 'CREATE',
        entityType: 'Book',
        description: 'librarian created Book',
        ipAddress: expect.any(String),
        user: {
          id: String(USERS.librarian),
          username: 'librarian',
          role: 'librarian',
        },
      });
    });

    it('takes the entity id from the route when the handler returns no id', async () => {
      await request(server())
        .patch('/members/2')
        .set(as(USERS.admin))
        .send({})
        .expect(200);
      expect(await latest()).toMatchObject({
        action: 'UPDATE',
        entityType: 'Member',
        entityId: '2',
      });
    });

    it('uses @LogActivity names and labels the row from the result', async () => {
      await request(server())
        .patch('/probe-loans/7/approve')
        .set(as(USERS.librarian))
        .expect(200);
      expect(await latest()).toMatchObject({
        action: 'APPROVE',
        entityType: 'Loan',
        entityId: '7',
        description: 'librarian approved Loan #7 "LN-7"',
      });
    });

    it('skips reads, members, anonymous callers and opted-out handlers', async () => {
      const before = await count();
      await request(server())
        .get('/books')
        .set(as(USERS.librarian))
        .expect(200);
      await request(server())
        .post('/probe-loans')
        .set(as(USERS.member))
        .expect(201);
      // Anonymous callers can't write at all now (global JWT guard)
      await request(server()).post('/books').send({}).expect(401);
      await request(server())
        .post('/probe-loans/login')
        .set(as(USERS.admin))
        .expect(201);
      expect(await count()).toBe(before);
    });
  });

  describe('GET /activity-logs', () => {
    it('filters by role, action and entity, newest first', async () => {
      const res = await request(server())
        .get('/activity-logs?role=librarian&entityType=Loan')
        .set(as(USERS.librarian))
        .expect(200);
      const rows = res.body.data as (LogRow & {
        user: { role: string };
        createdAt: string;
      })[];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(
        rows.every(
          (row) => row.user.role === 'librarian' && row.entityType === 'Loan',
        ),
      ).toBe(true);
      expect(rows.map((row) => row.createdAt)).toEqual(
        rows
          .map((row) => row.createdAt)
          .sort()
          .reverse(),
      );
    });

    it('searches descriptions and paginates', async () => {
      const res = await request(server())
        .get('/activity-logs?search=checked%20in&limit=1&page=1')
        .set(as(USERS.admin))
        .expect(200);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      });
      expect(res.body.data[0].description).toBe(
        'librarian checked in LoanItem #4 "CP-2"',
      );
    });

    it('lists filter values with counts', async () => {
      const res = await request(server())
        .get('/activity-logs/facets')
        .set(as(USERS.admin))
        .expect(200);
      expect(res.body.actions).toEqual(
        expect.arrayContaining([{ value: 'LOGIN', count: 1 }]),
      );
      expect(res.body.entityTypes).toEqual(
        expect.arrayContaining([{ value: 'LoanItem', count: 1 }]),
      );
    });

    it('validates the query and keeps members out', async () => {
      await request(server())
        .get('/activity-logs?limit=500')
        .set(as(USERS.admin))
        .expect(400);
      await request(server())
        .get('/activity-logs?userId=abc')
        .set(as(USERS.admin))
        .expect(400);
      await request(server())
        .get('/activity-logs?role=owner')
        .set(as(USERS.admin))
        .expect(400);
      await request(server())
        .get('/activity-logs')
        .set(as(USERS.member))
        .expect(403);
    });
  });
});
