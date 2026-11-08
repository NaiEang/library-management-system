import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/setup/test-env';

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
