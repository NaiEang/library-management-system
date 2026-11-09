import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '../common/constants';
import { LoginCandidate, UsersService } from '../users/users.service';
import { AuthAuditService } from './audit/auth-audit.service';
import { AuthService } from './auth.service';
import { AuthConfig } from './config/auth.config';
import { PasswordService } from './password/password.service';
import { RefreshTokenService } from './tokens/refresh-token.service';

const PASSWORD = 'a long and unusual passphrase';
const member: LoginCandidate = {
  id: '3',
  email: 'good.student@demo.com',
  username: 'goodstudent',
  status: 'active',
  passwordHash: '$argon2id$real',
  roleName: 'member',
  memberId: '30',
  membershipStatus: 'pending_deposit',
};

async function setup(candidate: LoginCandidate | null, passwordMatches = true) {
  const transactionManager = { id: 'tx' };
  const usersService = {
    findForLogin: vi.fn(() => Promise.resolve(candidate)),
    recordLogin: vi.fn(() => Promise.resolve()),
    findPasswordHash: vi.fn(() => Promise.resolve('$argon2id$current')),
    findProfile: vi.fn(() =>
      Promise.resolve({
        email: 'good.student@demo.com',
        username: 'goodstudent',
      }),
    ),
    updatePasswordHash: vi.fn(() => Promise.resolve()),
    inTransaction: vi.fn((work: (m: unknown) => Promise<unknown>) =>
      work(transactionManager),
    ),
    registerMember: vi.fn(() =>
      Promise.resolve({
        id: '41',
        email: 'new.member@demo.com',
        username: 'newmember',
        memberId: '410',
        memberCode: 'LF-2026-ABCDEF',
      }),
    ),
  };
  const passwordService = {
    hash: vi.fn(() => Promise.resolve('$argon2id$dummy')),
    verify: vi.fn((_hash: string, _password: string) =>
      Promise.resolve(passwordMatches),
    ),
  };
  const refreshTokens = {
    issue: vi.fn(() =>
      Promise.resolve({ token: 'raw-refresh', expiresAt: new Date() }),
    ),
    revokeAllForUser: vi.fn(() => Promise.resolve(2)),
  };
  const jwtService = { signAsync: vi.fn(() => Promise.resolve('signed.jwt')) };
  const audit = { record: vi.fn() };
  const service = new AuthService(
    usersService as unknown as UsersService,
    passwordService as unknown as PasswordService,
    refreshTokens as unknown as RefreshTokenService,
    jwtService as unknown as JwtService,
    audit as unknown as AuthAuditService,
    { jwtAccessTtlSeconds: 900 } as AuthConfig,
  );
  await service.onModuleInit();
  return {
    service,
    usersService,
    passwordService,
    refreshTokens,
    jwtService,
    audit,
    transactionManager,
  };
}

const input = {
  email: '  Good.Student@Demo.com ',
  password: PASSWORD,
  ip: '127.0.0.1',
  userAgent: 'vitest',
};

describe('AuthService.login', () => {
  it('returns the access token, user summary and a new refresh token', async () => {
    const { service, usersService, refreshTokens, jwtService } =
      await setup(member);
    const result = await service.login(input);

    expect(usersService.findForLogin).toHaveBeenCalledWith(
      'good.student@demo.com',
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: '3',
      role: RoleName.MEMBER,
    });
    expect(refreshTokens.issue).toHaveBeenCalledWith({
      userId: '3',
      role: RoleName.MEMBER,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });
    expect(usersService.recordLogin).toHaveBeenCalledWith('3');
    expect(result.body).toEqual({
      accessToken: 'signed.jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '3',
        email: member.email,
        username: 'goodstudent',
        role: 'member',
        membershipStatus: 'pending_deposit',
      },
    });
    expect(result.refresh.token).toBe('raw-refresh');
  });

  it('checks an unknown email against the dummy hash, so it takes as long as a wrong password', async () => {
    const { service, passwordService } = await setup(null, false);
    await expect(service.login(input)).rejects.toThrow(UnauthorizedException);
    expect(passwordService.verify).toHaveBeenCalledTimes(1);
    expect(passwordService.verify).toHaveBeenCalledWith(
      '$argon2id$dummy',
      PASSWORD,
    );
  });

  it('verifies the password even for a disabled account', async () => {
    const { service, passwordService } = await setup({
      ...member,
      status: 'disabled',
    });
    await expect(service.login(input)).rejects.toThrow(UnauthorizedException);
    expect(passwordService.verify).toHaveBeenCalledWith(
      '$argon2id$real',
      PASSWORD,
    );
  });

  it.each([
    ['unknown_email', null, false],
    ['wrong_password', member, false],
    ['disabled', { ...member, status: 'disabled' }, true],
    ['unknown_role', { ...member, roleName: 'superuser' }, true],
    ['unknown_role', { ...member, roleName: 'MEMBER' }, true],
    ['member_row_missing', { ...member, memberId: null }, true],
  ])(
    '%s → the same 401, no session, an audit event',
    async (reason, candidate, passwordMatches) => {
      const { service, refreshTokens, usersService, jwtService, audit } =
        await setup(
          candidate as LoginCandidate | null,
          passwordMatches as boolean,
        );
      await expect(service.login(input)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(refreshTokens.issue).not.toHaveBeenCalled();
      expect(usersService.recordLogin).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        'LOGIN_FAILURE',
        expect.objectContaining({ email: 'good.student@demo.com', reason }),
      );
    },
  );

  it('never passes the password or a token to the audit log', async () => {
    const ok = await setup(member);
    await ok.service.login(input);
    const failed = await setup(member, false);
    await failed.service.login(input).catch(() => undefined);
    const logged = JSON.stringify([
      ...ok.audit.record.mock.calls,
      ...failed.audit.record.mock.calls,
    ]);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain('raw-refresh');
    expect(logged).not.toContain('signed.jwt');
    expect(logged).not.toContain('$argon2id');
  });
});

describe('AuthService.register', () => {
  const dto = {
    email: 'new.member@demo.com',
    username: 'newmember',
    password: 'a long and unusual passphrase',
    firstName: 'New',
  };

  it('hashes the password and creates a pending_deposit MEMBER, without logging in', async () => {
    const {
      service,
      usersService,
      passwordService,
      refreshTokens,
      jwtService,
    } = await setup(null);
    await expect(service.register(dto)).resolves.toEqual({
      id: '41',
      email: 'new.member@demo.com',
      username: 'newmember',
      role: 'member',
      membershipStatus: 'pending_deposit',
    });
    expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
    expect(usersService.registerMember).toHaveBeenCalledWith({
      email: dto.email,
      username: dto.username,
      passwordHash: '$argon2id$dummy',
      firstName: 'New',
      lastName: undefined,
      phone: undefined,
    });
    expect(refreshTokens.issue).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'short1', /at least 8/],
    ['common', 'password1', /too common/],
    ['equal to the email', 'new.member@demo.com', /email or username/],
    ['equal to the username', 'NewMember', /email or username/],
  ])(
    'rejects a password that is %s with 400, before hashing or saving',
    async (_label, password, rule) => {
      const { service, usersService, passwordService } = await setup(null);
      passwordService.hash.mockClear();
      const error = await service
        .register({ ...dto, password })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        JSON.stringify((error as BadRequestException).getResponse()),
      ).toMatch(rule);
      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(usersService.registerMember).not.toHaveBeenCalled();
    },
  );

  it('passes a 409 from the users service through', async () => {
    const { service, usersService } = await setup(null);
    usersService.registerMember.mockRejectedValueOnce(
      new ConflictException('Email already registered'),
    );
    await expect(service.register(dto)).rejects.toThrow(
      'Email already registered',
    );
  });
});

describe('AuthService.changePassword', () => {
  const user = {
    id: '3',
    username: 'goodstudent',
    role: RoleName.MEMBER,
    memberId: '30',
  };
  const dto = {
    currentPassword: 'old long passphrase',
    newPassword: 'a brand new passphrase',
  };

  it('checks the current password, hashes the new one and ends every session, in one transaction', async () => {
    const {
      service,
      passwordService,
      usersService,
      refreshTokens,
      transactionManager,
    } = await setup(null);
    passwordService.verify.mockImplementation(
      (_hash: string, password: string) =>
        Promise.resolve(password === dto.currentPassword),
    );
    await service.changePassword(user, dto);
    expect(passwordService.hash).toHaveBeenLastCalledWith(dto.newPassword);
    expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
      '3',
      '$argon2id$dummy',
      transactionManager,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(
      '3',
      transactionManager,
    );
  });

  it('a wrong current password → 400, nothing changes', async () => {
    const { service, usersService, refreshTokens } = await setup(null, false);
    await expect(service.changePassword(user, dto)).rejects.toThrow(
      'Current password is incorrect',
    );
    expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('the same password again → 400', async () => {
    const { service, usersService } = await setup(null, true);
    await expect(service.changePassword(user, dto)).rejects.toThrow(
      /must be different/,
    );
    expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'short1', /at least 8/],
    ['common', 'password1', /too common/],
    ['equal to the username', 'GoodStudent', /email or username/],
  ])('a new password that is %s → 400', async (_label, newPassword, rule) => {
    const { service, passwordService, usersService } = await setup(null);
    passwordService.verify.mockImplementation(
      (_hash: string, password: string) =>
        Promise.resolve(password === dto.currentPassword),
    );
    const error = await service
      .changePassword(user, { ...dto, newPassword })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toMatch(rule);
    expect(usersService.updatePasswordHash).not.toHaveBeenCalled();
  });
});
