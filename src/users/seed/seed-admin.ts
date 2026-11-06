import { isEmail } from 'class-validator';
import { DataSource } from 'typeorm';
import { checkPasswordPolicy } from '../../auth/password/password-policy';
import { PasswordService } from '../../auth/password/password.service';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { RoleName, UserStatus } from '../../common/constants';
import {
  normalizeEmail,
  normalizeUsername,
  USERNAME_PATTERN,
} from '../normalize';

export interface SeedAdminEnv {
  SEED_ADMIN_EMAIL?: string;
  SEED_ADMIN_PASSWORD?: string;
  SEED_ADMIN_USERNAME?: string;
}

export type SeedAdminResult = 'created' | 'skipped';

interface SeedLogger {
  log(message: string): void;
}

// Creates the first admin from env vars. Safe to run again: it does nothing
// once an active admin exists. Error messages never contain the password.
export async function seedAdmin(
  dataSource: DataSource,
  env: SeedAdminEnv,
  passwordService: PasswordService,
  logger: SeedLogger,
): Promise<SeedAdminResult> {
  const email = normalizeEmail(env.SEED_ADMIN_EMAIL ?? '');
  const username = normalizeUsername(env.SEED_ADMIN_USERNAME ?? 'admin');
  const password = env.SEED_ADMIN_PASSWORD ?? '';

  const problems: string[] = [];
  if (!isEmail(email) || email.length > 255) {
    problems.push('SEED_ADMIN_EMAIL must be a valid email address');
  }
  if (!USERNAME_PATTERN.test(username)) {
    problems.push(
      'SEED_ADMIN_USERNAME must be 3-30 characters: a-z, 0-9, dot, underscore or hyphen',
    );
  }
  problems.push(
    ...checkPasswordPolicy(password, { email, username }).map(
      (p) => `SEED_ADMIN_PASSWORD: ${p}`,
    ),
  );
  if (problems.length > 0) {
    throw new Error(`Cannot seed the admin:\n- ${problems.join('\n- ')}`);
  }

  const passwordHash = await passwordService.hash(password);

  return dataSource.transaction(async (manager) => {
    const adminRole = await manager.findOne(Role, {
      where: { name: RoleName.ADMIN },
    });
    if (!adminRole) {
      throw new Error('Role ADMIN not found; run the migrations first');
    }

    const activeAdmins = await manager.count(User, {
      where: { roleId: adminRole.id, status: UserStatus.ACTIVE },
    });
    if (activeAdmins > 0) {
      logger.log('An active admin already exists; nothing to do');
      return 'skipped';
    }

    const taken = await manager.findOne(User, {
      where: [{ email }, { username }],
      select: { id: true },
    });
    if (taken) {
      throw new Error(
        'SEED_ADMIN_EMAIL or SEED_ADMIN_USERNAME is already used by another account',
      );
    }

    await manager.insert(User, {
      roleId: adminRole.id,
      email,
      username,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    logger.log(`Created admin ${email}`);
    return 'created';
  });
}
