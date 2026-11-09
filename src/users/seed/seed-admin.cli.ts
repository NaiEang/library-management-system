// npm run seed:admin — run after the migrations. Reads SEED_ADMIN_* from .env.
import { Logger } from '@nestjs/common';
import { PasswordService } from '../../auth/password/password.service';
import { AppDataSource } from '../../database/data-source';
import { seedAdmin } from './seed-admin';

async function main() {
  const logger = new Logger('SeedAdmin');
  await AppDataSource.initialize();
  try {
    await seedAdmin(AppDataSource, process.env, new PasswordService(), logger);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: Error) => {
  new Logger('SeedAdmin').error(error.message);
  process.exitCode = 1;
});
