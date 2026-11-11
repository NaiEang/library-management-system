// Applied to every spec, and read by global-setup. Values here beat .env, which dotenv never overrides.
export const TEST_ENV = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://libraflow:libraflow@localhost:5432/libraflow_test',
  DB_SSL: 'false',
  // Test-only values for the auth module (the app refuses to start without them)
  JWT_ACCESS_SECRET: 'e2e-only-jwt-secret-7Fq2xL9mPz4KcR8vWb3NdY6h',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  LOG_FILE: '',
  LOG_STDOUT: 'false',
  // Keeps test queue jobs apart from a dev server sharing the same Redis
  BULLMQ_PREFIX: 'bull-e2e',
  // The cron stays off; specs call POST /notifications/overdue/scan instead
  OVERDUE_SCAN_CRON: 'off',
  // Reminders go to the log, never to a real mailbox
  SMTP_HOST: '',
};
