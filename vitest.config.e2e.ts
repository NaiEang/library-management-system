import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/setup/test-env';

// Same clock as CI, set before the test workers start (they inherit it):
// created_at is a timestamp without time zone, so on a non-UTC machine
// (e.g. Asia/Phnom_Penh) rows made by the database would read 7 hours early
process.env.TZ = 'UTC';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**'],
    // Rebuilds a local test database with known fixtures; Supabase is never touched
    globalSetup: ['./test/setup/global-setup.ts'],
    env: TEST_ENV,
    // Specs share that database, so run them one file at a time
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
