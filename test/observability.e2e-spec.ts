import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { as, createTestApp } from './setup/app';
import { USERS } from './setup/fixtures';

describe('Observability (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports health with the database round trip', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: { status: 'up' } });
  });

  it('exposes RED and library metrics for Prometheus', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/books')
      .set(as(USERS.librarian))
      .expect(200);
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.text).toContain(
      'http_server_request_duration_seconds_bucket{le="0.005",method="GET",route="/api/v1/books"',
    );
    expect(res.text).toContain('libraflow_overdue_loan_items 1');
    expect(res.text).toContain('libraflow_book_copies{status="lost"} 1');
  });

  it('serves the JSON metrics summary and access logs to admins only', async () => {
    const summary = await request(app.getHttpServer())
      .get('/observability/metrics')
      .set(as(USERS.admin))
      .expect(200);
    expect(summary.body.series).toHaveLength(30);
    expect(summary.body.business.overdueItems).toBe(1);

    const logs = await request(app.getHttpServer())
      .get('/observability/logs?context=HTTP&search=/books')
      .set(as(USERS.admin))
      .expect(200);
    expect(logs.body[0]).toMatchObject({
      level: 'log',
      context: 'HTTP',
      message: expect.stringContaining('GET /api/v1/books 200'),
    });

    await request(app.getHttpServer())
      .get('/observability/metrics')
      .set(as(USERS.librarian))
      .expect(403);
  });
});
