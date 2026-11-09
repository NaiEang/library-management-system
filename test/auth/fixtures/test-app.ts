import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { App } from 'supertest/types';
import { AuthModule } from '../../../src/auth/auth.module';
import { RefreshToken } from '../../../src/auth/entities/refresh-token.entity';
import { PasswordService } from '../../../src/auth/password/password.service';
import { Member } from '../../../src/members/entities/member.entity';
import { Role } from '../../../src/users/entities/role.entity';
import { User } from '../../../src/users/entities/user.entity';
import { FakeEntityManager, FakeRepository } from './fake-repository';

export const TEST_SECRET = randomBytes(48).toString('base64url');
export const FRONTEND_ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'a long and unusual passphrase';

let passwordHash: Promise<string> | undefined;
// Real argon2id hash of PASSWORD, computed once per test file.
export function hashedPassword(): Promise<string> {
  passwordHash ??= new PasswordService().hash(PASSWORD);
  return passwordHash;
}

const ROLE_IDS: Record<string, number> = { admin: 1, librarian: 2, member: 3 };

export interface FakeUserInput {
  id: string;
  // Any string, so tests can also build users with invalid roles.
  role: string;
  email?: string;
  username?: string;
  status?: string;
  memberId?: string | null;
  membershipStatus?: string;
}

// A users row shaped like the entity, with its role and member relations loaded.
export async function makeUser(input: FakeUserInput): Promise<User> {
  const memberId =
    input.memberId === undefined
      ? input.role === 'member'
        ? `${input.id}0`
        : null
      : input.memberId;
  return {
    id: input.id,
    roleId: ROLE_IDS[input.role] ?? 99,
    username: input.username ?? `user${input.id}`,
    email: input.email ?? `user${input.id}@libraflow.test`,
    passwordHash: await hashedPassword(),
    firstName: 'Test',
    lastName: `User${input.id}`,
    phone: null,
    status: input.status ?? 'active',
    lastLoginAt: null,
    role: { id: ROLE_IDS[input.role] ?? 99, name: input.role },
    member: memberId
      ? {
          id: memberId,
          userId: input.id,
          memberCode: `LF-2026-${input.id}`,
          membershipDate: '2026-11-01',
          expiryDate: null,
          membershipStatus: input.membershipStatus ?? 'pending_deposit',
          depositAmount: '0.00',
        }
      : null,
  } as unknown as User;
}

export interface TestApp {
  app: INestApplication<App>;
  users: FakeRepository<User>;
  members: FakeRepository<Member>;
  refreshTokens: FakeRepository<RefreshToken>;
}

// The roles the migration guarantees.
export const ROLES = [
  { id: 1, name: 'admin' },
  { id: 2, name: 'librarian' },
  { id: 3, name: 'member' },
] as unknown as Role[];

// The real AuthModule and UsersModule with in-memory repositories: no database.
export async function createTestApp(
  users: User[],
  imports: unknown[] = [],
): Promise<TestApp> {
  process.env.JWT_ACCESS_SECRET = TEST_SECRET;
  process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;

  const userRepository = new FakeRepository<User>(users);
  const roleRepository = new FakeRepository<Role>(structuredClone(ROLES));
  const memberRepository = new FakeRepository<Member>();
  const refreshTokenRepository = new FakeRepository<RefreshToken>();
  // What a database join would return for newly inserted rows.
  userRepository.onInsert = (user) => {
    user.role = roleRepository.rows.find((role) => role.id === user.roleId)!;
    user.member = null as unknown as Member;
  };
  memberRepository.onInsert = (member) => {
    const owner = userRepository.rows.find((user) => user.id === member.userId);
    if (owner) {
      owner.member = structuredClone(member);
    }
  };
  userRepository.manager = new FakeEntityManager(
    new Map<unknown, FakeRepository<any>>([
      [User, userRepository],
      [Role, roleRepository],
      [Member, memberRepository],
    ]),
  );

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ ignoreEnvFile: true }),
      AuthModule,
      ...(imports as never[]),
    ],
  })
    .overrideProvider(getRepositoryToken(User))
    .useValue(userRepository)
    .overrideProvider(getRepositoryToken(Role))
    .useValue(roleRepository)
    .overrideProvider(getRepositoryToken(Member))
    .useValue(memberRepository)
    .overrideProvider(getRepositoryToken(RefreshToken))
    .useValue(refreshTokenRepository)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  // Same global pipe as src/main.ts.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return {
    app,
    users: userRepository,
    members: memberRepository,
    refreshTokens: refreshTokenRepository,
  };
}
