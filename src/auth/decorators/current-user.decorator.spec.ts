import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RoleName } from '../../common/constants';
import { AuthUser } from '../types/auth-user';
import { currentUserFactory } from './current-user.decorator';

function contextWith(user?: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser', () => {
  const user: AuthUser = {
    id: '3',
    username: 'member.one',
    role: RoleName.MEMBER,
    memberId: '30',
  };

  it('returns the whole user', () => {
    expect(currentUserFactory(undefined, contextWith(user))).toEqual({
      id: '3',
      username: 'member.one',
      role: 'member',
      memberId: '30',
    });
  });

  it('returns a single field', () => {
    expect(currentUserFactory('memberId', contextWith(user))).toBe('30');
  });

  it('throws 401 on a request without a user (for example a @Public route)', () => {
    expect(() => currentUserFactory(undefined, contextWith())).toThrow(
      UnauthorizedException,
    );
  });
});
