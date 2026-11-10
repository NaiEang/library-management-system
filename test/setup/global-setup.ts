import {
  ensureDatabase,
  localDataSource,
  resetSchema,
} from '../../src/database/local-db';
import { seedFixtures } from './fixtures';
import { TEST_ENV } from './test-env';

/** Rebuilds the test database once per run. Specs then share it, one file at a time. */
export default async function setup() {
  const dataSource = localDataSource(TEST_ENV.DATABASE_URL);
  try {
    // A fresh Postgres has no libraflow_test yet; create it on the first run
    await ensureDatabase(TEST_ENV.DATABASE_URL);
    await dataSource.initialize();
  } catch (error) {
    const target = new URL(TEST_ENV.DATABASE_URL);
    throw new Error(
      `E2E tests need Postgres at ${target.host}${target.pathname} (set TEST_DATABASE_URL to change it). ` +
        `Start one with \`docker compose up -d postgres\`. ${(error as Error).message}`,
    );
  }
  await resetSchema(dataSource);
  await seedFixtures(dataSource);
  await dataSource.destroy();
}
