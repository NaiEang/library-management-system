import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';

describe('Loans Module (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('Validation Case: Should reject loan request with missing data (400 Bad Request)', () => {
    return request(app.getHttpServer())
      .post('/loans/request')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toEqual('Bad Request');
        expect(res.body.message).toContain('memberId must be a string');
      });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});