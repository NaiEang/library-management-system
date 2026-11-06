import { UnauthorizedException } from '@nestjs/common';
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
  roleName: 'MEMBER',
  memberId: '30',
  membershipStatus: 'pending_deposit',
};

async function setup(candidate: LoginCandidate | null, passwordMatches = true) {
  const usersService = {
    findForLogin: vi.fn(() => Promise.resolve(candidate)),
    recordLogin: vi.fn(() => Promise.resolve()),
  };
  const passwordService = {
    hash: vi.fn(() => Promise.resolve('$argon2id$dummy')),
    verify: vi.fn(() => Promise.resolve(passwordMatches)),
  };
  const refreshTokens = {
    issue: vi.fn(() =>
      Promise.resolve({ token: 'raw-refresh', expiresAt: new Date() }),
    ),
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
        role: 'MEMBER',
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
    ['unknown_role', { ...member, roleName: 'member' }, true],
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
