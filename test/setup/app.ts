import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** Boots the real AppModule with the same middleware, pipes and interceptors as main.ts. */
export async function createTestApp(
  controllers: Type[] = [],
): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  const app = configureApp(
    moduleFixture.createNestApplication<INestApplication<App>>({
      logger: false,
    }),
  );
  await app.init();
  return app;
}

/** Acts as a user through the DEV_AUTH header. */
export const as = (userId: number) => ({ 'x-user-id': String(userId) });
