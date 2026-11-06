import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { RoleName } from '../../common/constants';
import { Public } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

class TestController {
  @Public()
  guest() {}
  protectedRoute() {}
}

function contextFor(method: 'guest' | 'protectedRoute'): ExecutionContext {
  return {
    getHandler: () => TestController.prototype[method],
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const passportCanActivate = vi.spyOn(
    AuthGuard('jwt').prototype,
    'canActivate',
  );

  afterEach(() => passportCanActivate.mockReset());

  it('lets @Public routes through without checking a token', () => {
    expect(guard.canActivate(contextFor('guest'))).toBe(true);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('runs the JWT check on routes that are not @Public', async () => {
    passportCanActivate.mockResolvedValue(true);
    await guard.canActivate(contextFor('protectedRoute'));
    expect(passportCanActivate).toHaveBeenCalledTimes(1);
  });

  it('returns the user when Passport accepted the token', () => {
    const user = { id: '1', role: RoleName.ADMIN };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it.each([
    ['an error', new Error('jwt expired'), false],
    ['no user', null, false],
    ['an error even with a user', new Error('db down'), { id: '1' }],
  ])('throws 401 on %s', (_label, err, user) => {
    expect(() => guard.handleRequest(err, user)).toThrow(UnauthorizedException);
  });
});
