import { DataSource } from 'typeorm';
import { PasswordService } from '../../auth/password/password.service';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { seedAdmin } from './seed-admin';

const PASSWORD = 'a long and unusual passphrase';
const env = {
  SEED_ADMIN_EMAIL: '  Admin@LibraFlow.Test ',
  SEED_ADMIN_PASSWORD: PASSWORD,
};

function setup({
  adminRole = { id: 1 } as Role | null,
  activeAdmins = 0,
  taken = null as User | null,
} = {}) {
  const manager = {
    findOne: vi.fn((entity: unknown) =>
      Promise.resolve(entity === Role ? adminRole : taken),
    ),
    count: vi.fn(() => Promise.resolve(activeAdmins)),
    insert: vi.fn(() => Promise.resolve()),
  };
  const transaction = vi.fn((work: (m: typeof manager) => unknown) =>
    work(manager),
  );
  const dataSource = { transaction } as unknown as DataSource;
  const passwordService = {
    hash: vi.fn(() => Promise.resolve('$argon2id$hashed')),
  } as unknown as PasswordService;
  const logger = { log: vi.fn() };
  return { manager, transaction, dataSource, passwordService, logger };
}

describe('seedAdmin', () => {
  it('creates an active ADMIN with a normalized email, default username and hashed password', async () => {
    const { manager, dataSource, passwordService, logger } = setup();
    await expect(
      seedAdmin(dataSource, env, passwordService, logger),
    ).resolves.toBe('created');
    expect(manager.insert).toHaveBeenCalledWith(User, {
      roleId: 1,
      email: 'admin@libraflow.test',
      username: 'admin',
      passwordHash: '$argon2id$hashed',
      status: 'active',
    });
  });

  it('does nothing when an active admin already exists (safe to re-run)', async () => {
    const { manager, dataSource, passwordService, logger } = setup({
      activeAdmins: 1,
    });
    await expect(
      seedAdmin(dataSource, env, passwordService, logger),
    ).resolves.toBe('skipped');
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('fails when the ADMIN role is missing (migrations not run)', async () => {
    const { dataSource, passwordService, logger } = setup({ adminRole: null });
    await expect(
      seedAdmin(dataSource, env, passwordService, logger),
    ).rejects.toThrow(/run the migrations/);
  });

  it('refuses to take over an existing account with the same email or username', async () => {
    const { manager, dataSource, passwordService, logger } = setup({
      taken: { id: '9' } as User,
    });
    await expect(
      seedAdmin(dataSource, env, passwordService, logger),
    ).rejects.toThrow(/already used/);
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing email', { SEED_ADMIN_PASSWORD: PASSWORD }, /SEED_ADMIN_EMAIL/],
    [
      'an invalid email',
      { ...env, SEED_ADMIN_EMAIL: 'not-an-email' },
      /SEED_ADMIN_EMAIL/,
    ],
    [
      'a missing password',
      { SEED_ADMIN_EMAIL: 'admin@libraflow.test' },
      /at least 8/,
    ],
    [
      'a common password',
      { ...env, SEED_ADMIN_PASSWORD: 'qwerty123' },
      /too common/,
    ],
    [
      'the empty placeholder from .env.example',
      { ...env, SEED_ADMIN_PASSWORD: '' },
      /at least 8/,
    ],
    [
      'an old change-me placeholder',
      { ...env, SEED_ADMIN_PASSWORD: 'change-me' },
      /too common/,
    ],
    [
      'an invalid username',
      { ...env, SEED_ADMIN_USERNAME: 'a b' },
      /SEED_ADMIN_USERNAME/,
    ],
  ])(
    'rejects %s before touching the database',
    async (_label, badEnv, message) => {
      const { transaction, dataSource, passwordService, logger } = setup();
      await expect(
        seedAdmin(dataSource, badEnv, passwordService, logger),
      ).rejects.toThrow(message);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('never puts the password in a log line or an error', async () => {
    const created = setup();
    await seedAdmin(
      created.dataSource,
      env,
      created.passwordService,
      created.logger,
    );
    const weak = 'admin@libraflow.test';
    const rejected = setup();
    const error = await seedAdmin(
      rejected.dataSource,
      { ...env, SEED_ADMIN_PASSWORD: weak },
      rejected.passwordService,
      rejected.logger,
    ).catch((e: Error) => e);
    const logged = created.logger.log.mock.calls.flat().join(' ');
    expect(logged).not.toContain(PASSWORD);
    expect((error as Error).message).toMatch(/email or username/);
    expect((error as Error).message).not.toContain(PASSWORD);
  });
});
