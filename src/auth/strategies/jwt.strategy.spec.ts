import { UnauthorizedException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { RoleName } from '../../common/constants';
import { AuthUserRecord, UsersService } from '../../users/users.service';
import { AuthConfig } from '../config/auth.config';
import { JwtStrategy } from './jwt.strategy';

const config = { jwtAccessSecret: 'x'.repeat(48) } as AuthConfig;

function strategyReturning(record: AuthUserRecord | null | Error) {
  const findForAuth = vi.fn(() =>
    record instanceof Error ? Promise.reject(record) : Promise.resolve(record),
  );
  const strategy = new JwtStrategy(config, {
    findForAuth,
  } as unknown as UsersService);
  return { strategy, findForAuth };
}

const activeMember: AuthUserRecord = {
  id: '3',
  username: 'member.one',
  status: 'active',
  roleName: 'member',
  memberId: '30',
};

describe('JwtStrategy.validate', () => {
  beforeAll(() =>
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
  );

  it('returns { id, username, role, memberId } for an active member', async () => {
    const { strategy, findForAuth } = strategyReturning(activeMember);
    await expect(
      strategy.validate({ sub: '3', role: RoleName.MEMBER }),
    ).resolves.toEqual({
      id: '3',
      username: 'member.one',
      role: RoleName.MEMBER,
      memberId: '30',
    });
    expect(findForAuth).toHaveBeenCalledWith('3');
  });

  it('omits memberId for staff', async () => {
    const { strategy } = strategyReturning({
      id: '1',
      username: 'admin',
      status: 'active',
      roleName: 'admin',
      memberId: null,
    });
    await expect(
      strategy.validate({ sub: '1', role: RoleName.ADMIN }),
    ).resolves.toEqual({
      id: '1',
      username: 'admin',
      role: RoleName.ADMIN,
    });
  });

  it('never attaches memberId to staff, even if a member row exists', async () => {
    const { strategy } = strategyReturning({
      id: '2',
      username: 'desk.librarian',
      status: 'active',
      roleName: 'librarian',
      memberId: '20',
    });
    await expect(
      strategy.validate({ sub: '2', role: RoleName.LIBRARIAN }),
    ).resolves.toEqual({
      id: '2',
      username: 'desk.librarian',
      role: RoleName.LIBRARIAN,
    });
  });

  it('takes the role from the database, not from the token', async () => {
    const { strategy } = strategyReturning(activeMember);
    const user = await strategy.validate({ sub: '3', role: RoleName.ADMIN });
    expect(user.role).toBe(RoleName.MEMBER);
  });

  it.each([
    ['the user no longer exists', null],
    ['the account is disabled', { ...activeMember, status: 'disabled' }],
    [
      'the account has a legacy non-active status',
      { ...activeMember, status: 'suspended' },
    ],
    ['the role is unknown', { ...activeMember, roleName: 'superuser' }],
    ['the role is not lowercase', { ...activeMember, roleName: 'MEMBER' }],
    ['the role is missing', { ...activeMember, roleName: null }],
    ['a MEMBER has no member row', { ...activeMember, memberId: null }],
    ['the database throws', new Error('connection refused')],
  ])('rejects with 401 when %s', async (_label, record) => {
    const { strategy } = strategyReturning(
      record as AuthUserRecord | null | Error,
    );
    await expect(
      strategy.validate({ sub: '3', role: RoleName.MEMBER }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([undefined, '', 'abc', '1 OR 1=1', 3])(
    'rejects a malformed sub (%s) without querying',
    async (sub) => {
      const { strategy, findForAuth } = strategyReturning(activeMember);
      await expect(
        strategy.validate({
          sub: sub as unknown as string,
          role: RoleName.MEMBER,
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(findForAuth).not.toHaveBeenCalled();
    },
  );
});
