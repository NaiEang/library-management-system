// Applied to every spec, and read by global-setup. Values here beat .env, which dotenv never overrides.
export const TEST_ENV = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://libraflow:libraflow@localhost:5432/libraflow_test',
  DB_SSL: 'false',
  DEV_AUTH: 'true',
  LOG_FILE: '',
  LOG_STDOUT: 'false',
};
