import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthConfig } from '../auth/config/auth.config';
import { PasswordService } from '../auth/password/password.service';
import { Member } from '../members/entities/member.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { uniqueViolationColumn, UsersService } from './users.service';

const config = { libraryTimeZone: 'Asia/Phnom_Penh' } as AuthConfig;
const passwordService = {
  hash: vi.fn(() => Promise.resolve('$argon2id$hashed')),
} as unknown as PasswordService;

function setup(user: Partial<User> | null) {
  const repo = {
    findOne: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve({ affected: 1 })),
  };
  return {
    repo,
    service: new UsersService(
      repo as unknown as Repository<User>,
      config,
      passwordService,
    ),
  };
}

describe('UsersService', () => {
  it('findForLogin looks up the normalized email and selects the hash explicitly', async () => {
    const { repo, service } = setup(null);
    await service.findForLogin('  Good.Student@Demo.COM ');
    const options = (
      repo.findOne.mock.calls[0] as unknown as [
        { where: object; select: { passwordHash: boolean } },
      ]
    )[0];
    expect(options.where).toEqual({ email: 'good.student@demo.com' });
    expect(options.select.passwordHash).toBe(true);
  });

  it('findForAuth never selects the password hash', async () => {
    const { repo, service } = setup(null);
    await service.findForAuth('3');
    const options = (
      repo.findOne.mock.calls[0] as unknown as [
        { select: Record<string, unknown> },
      ]
    )[0];
    expect(options.select.passwordHash).toBeUndefined();
  });

  it('findForLogin flattens role and member', async () => {
    const { service } = setup({
      id: '2',
      email: 'librarian@libraflow.test',
      username: 'lib',
      status: 'active',
      passwordHash: 'h',
      role: { name: 'LIBRARIAN' },
      member: undefined,
    } as unknown as User);
    await expect(
      service.findForLogin('librarian@libraflow.test'),
    ).resolves.toMatchObject({
      roleName: 'LIBRARIAN',
      memberId: null,
      membershipStatus: null,
    });
  });

  it('recordLogin sets last_login_at to now', async () => {
    const { repo, service } = setup(null);
    await service.recordLogin('3');
    expect(repo.update).toHaveBeenCalledWith(
      { id: '3' },
      { lastLoginAt: expect.any(Date) },
    );
  });

  it('findProfile returns null for a missing user', async () => {
    await expect(setup(null).service.findProfile('99')).resolves.toBeNull();
  });
});

const uniqueViolation = (column: string) =>
  new QueryFailedError('INSERT', [], {
    code: '23505',
    detail: `Key (${column})=(x) already exists.`,
  } as unknown as Error);

const input = {
  email: 'good.student@demo.com',
  username: 'goodstudent',
  passwordHash: '$argon2id$hash',
  firstName: 'Good',
};

// A mocked EntityManager: one findOne for the duplicate check, one for the role.
function registerSetup({
  taken = null as Partial<User> | null,
  role = { id: 3 } as Partial<Role> | null,
  insertErrors = [] as unknown[],
} = {}) {
  const errors = [...insertErrors];
  const manager = {
    findOne: vi.fn((entity: unknown) =>
      Promise.resolve(entity === Role ? role : taken),
    ),
    insert: vi.fn((entity: unknown) => {
      const error = errors.shift();
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve({
        identifiers: [{ id: entity === User ? '41' : '410' }],
      });
    }),
  };
  const transaction = vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
    work(manager),
  );
  const repo = { manager: { transaction } };
  const service = new UsersService(
    repo as unknown as Repository<User>,
    config,
    passwordService,
  );
  const inserted = (entity: unknown) =>
    (
      manager.insert.mock.calls
        .filter(([e]) => e === entity)
        .at(-1) as unknown as [unknown, Record<string, unknown>]
    )[1];
  return { service, manager, transaction, inserted };
}

describe('UsersService.registerMember', () => {
  afterEach(() => vi.useRealTimers());

  it('creates an active MEMBER user and a pending_deposit member row in one transaction', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T03:00:00Z') });
    const { service, manager, transaction, inserted } = registerSetup();
    const result = await service.registerMember(input);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledTimes(2);
    expect(inserted(User)).toEqual({
      roleId: 3,
      email: 'good.student@demo.com',
      username: 'goodstudent',
      passwordHash: '$argon2id$hash',
      firstName: 'Good',
      lastName: undefined,
      phone: undefined,
      status: 'active',
    });
    expect(inserted(Member)).toEqual({
      userId: '41',
      memberCode: expect.stringMatching(/^LF-2026-[A-Z2-7]{6}$/),
      membershipDate: '2026-11-06',
      expiryDate: null,
      membershipStatus: 'pending_deposit',
      depositAmount: 0,
    });
    expect(result).toEqual({
      id: '41',
      email: 'good.student@demo.com',
      username: 'goodstudent',
      memberId: '410',
      memberCode: inserted(Member).memberCode,
    });
  });

  it("uses the library's date for membership_date, not UTC", async () => {
    // 01:00 on Nov 7 in Phnom Penh, still Nov 6 in UTC.
    vi.useFakeTimers({ now: new Date('2026-11-06T18:00:00Z') });
    const { service, inserted } = registerSetup();
    await service.registerMember(input);
    expect(inserted(Member).membershipDate).toBe('2026-11-07');
  });

  it.each([
    ['email', { email: input.email }, 'Email already registered'],
    ['username', { email: 'other@demo.com' }, 'Username already taken'],
  ])(
    'a taken %s → 409 before inserting anything',
    async (_label, taken, message) => {
      const { service, manager } = registerSetup({ taken });
      await expect(service.registerMember(input)).rejects.toThrow(
        new ConflictException(message),
      );
      expect(manager.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['email', 'Email already registered'],
    ['username', 'Username already taken'],
  ])(
    'a parallel sign-up that wins the race on %s → 409 (from Postgres 23505)',
    async (column, message) => {
      const { service } = registerSetup({
        insertErrors: [uniqueViolation(column)],
      });
      await expect(service.registerMember(input)).rejects.toThrow(
        new ConflictException(message),
      );
    },
  );

  it('retries the whole transaction when the random member code collides', async () => {
    const { service, transaction } = registerSetup({
      insertErrors: [undefined, uniqueViolation('member_code')],
    });
    await expect(service.registerMember(input)).resolves.toMatchObject({
      id: '41',
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 member code collisions', async () => {
    const collision = uniqueViolation('member_code');
    const { service, transaction } = registerSetup({
      insertErrors: [
        undefined,
        collision,
        undefined,
        collision,
        undefined,
        collision,
      ],
    });
    await expect(service.registerMember(input)).rejects.toBe(collision);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('propagates a failure of the member insert, so the transaction rolls back the user', async () => {
    const failure = new Error('members insert failed');
    const { service, transaction } = registerSetup({
      insertErrors: [undefined, failure],
    });
    await expect(service.registerMember(input)).rejects.toBe(failure);
    // Both inserts ran inside the same transaction callback.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('fails safely when the MEMBER role is missing', async () => {
    const { service, manager } = registerSetup({ role: null });
    await expect(service.registerMember(input)).rejects.toThrow(
      /Role MEMBER not found/,
    );
    expect(manager.insert).not.toHaveBeenCalled();
  });
});

describe('uniqueViolationColumn', () => {
  it('reads the column from a 23505 error', () => {
    expect(uniqueViolationColumn(uniqueViolation('member_code'))).toBe(
      'member_code',
    );
  });

  it.each([
    new Error('plain error'),
    new QueryFailedError('INSERT', [], {
      code: '23503',
      detail: 'Key (role_id)=(9) is not present',
    } as unknown as Error),
    new ConflictException('x'),
  ])('returns null for anything else', (error) => {
    expect(uniqueViolationColumn(error)).toBeNull();
  });
});

describe('UsersService.createLibrarian', () => {
  const staff = {
    email: 'desk.librarian@libraflow.test',
    username: 'desk.librarian',
    password: 'a long and unusual passphrase',
    firstName: 'Desk',
    lastName: 'Librarian',
  };

  it('creates an active LIBRARIAN with a hashed password and no member row', async () => {
    const { service, manager, inserted } = registerSetup({ role: { id: 2 } });
    await expect(service.createLibrarian(staff)).resolves.toEqual({
      id: '41',
      email: staff.email,
      username: staff.username,
      firstName: 'Desk',
      lastName: 'Librarian',
      phone: null,
      role: 'LIBRARIAN',
      status: 'active',
    });
    expect(manager.findOne).toHaveBeenCalledWith(
      Role,
      expect.objectContaining({ where: { name: 'LIBRARIAN' } }),
    );
    expect(inserted(User)).toMatchObject({
      roleId: 2,
      passwordHash: '$argon2id$hashed',
      status: 'active',
    });
    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.insert).not.toHaveBeenCalledWith(Member, expect.anything());
  });

  it('never returns or stores the plain password', async () => {
    const { service, inserted } = registerSetup({ role: { id: 2 } });
    const result = await service.createLibrarian(staff);
    expect(JSON.stringify(result)).not.toContain(staff.password);
    expect(JSON.stringify(inserted(User))).not.toContain(staff.password);
  });

  it.each([
    ['too short', 'short1', /at least 8/],
    ['common', 'password1', /too common/],
    ['equal to the username', 'Desk.Librarian', /email or username/],
  ])(
    'rejects a password that is %s with 400, before touching the database',
    async (_label, password, rule) => {
      const { service, transaction } = registerSetup();
      const error = await service
        .createLibrarian({ ...staff, password })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        JSON.stringify((error as BadRequestException).getResponse()),
      ).toMatch(rule);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'email (pre-check)',
      { taken: { email: 'desk.librarian@libraflow.test' } },
      'Email already registered',
    ],
    [
      'username (pre-check)',
      { taken: { email: 'other@x.com' } },
      'Username already taken',
    ],
    [
      'email (race, 23505)',
      { insertErrors: [uniqueViolation('email')] },
      'Email already registered',
    ],
  ])('a taken %s → 409', async (_label, options, message) => {
    const { service } = registerSetup({ role: { id: 2 }, ...options });
    await expect(service.createLibrarian(staff)).rejects.toThrow(
      new ConflictException(message),
    );
  });

  it('fails safely when the LIBRARIAN role is missing', async () => {
    const { service } = registerSetup({ role: null });
    await expect(service.createLibrarian(staff)).rejects.toThrow(
      /Role LIBRARIAN not found/,
    );
  });
});
