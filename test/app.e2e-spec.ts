import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Loans Module (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Validation Case: Should reject loan request with missing data (400 Bad Request)', () => {
    return request(app.getHttpServer())
      .post('/loans/request')
      .send({
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toEqual('Bad Request');
        expect(res.body.message).toContain('memberId must be a string');
      });
  });
});