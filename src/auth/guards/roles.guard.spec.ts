import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../common/constants';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';
import { RolesGuard } from './roles.guard';

class OpenController {
  anyUser() {}
  @Roles(RoleName.ADMIN)
  adminOnly() {}
  @Roles(RoleName.LIBRARIAN, RoleName.ADMIN)
  staff() {}
  @Public()
  guest() {}
  @Public()
  @Roles(RoleName.ADMIN)
  contradictory() {}
}

@Roles(RoleName.ADMIN)
class AdminController {
  inherited() {}
  @Roles(RoleName.MEMBER)
  overridden() {}
}

function contextFor(
  cls: object,
  method: string,
  user?: AuthUser,
): ExecutionContext {
  const handler = (cls as { prototype: Record<string, () => void> }).prototype[
    method
  ];
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const member: AuthUser = {
  id: '3',
  username: 'member.one',
  role: RoleName.MEMBER,
  memberId: '30',
};
const librarian: AuthUser = {
  id: '2',
  username: 'desk.librarian',
  role: RoleName.LIBRARIAN,
};
const admin: AuthUser = { id: '1', username: 'admin', role: RoleName.ADMIN };

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows any logged-in user when the route has no @Roles', () => {
    expect(
      guard.canActivate(contextFor(OpenController, 'anyUser', member)),
    ).toBe(true);
  });

  it('rejects a route without @Roles when there is no user', () => {
    expect(() =>
      guard.canActivate(contextFor(OpenController, 'anyUser')),
    ).toThrow(UnauthorizedException);
  });

  it('allows a guest on a @Public route', () => {
    expect(guard.canActivate(contextFor(OpenController, 'guest'))).toBe(true);
  });

  it('allows a matching role', () => {
    expect(
      guard.canActivate(contextFor(OpenController, 'adminOnly', admin)),
    ).toBe(true);
    expect(
      guard.canActivate(contextFor(OpenController, 'staff', librarian)),
    ).toBe(true);
  });

  it('rejects a wrong role with 403', () => {
    expect(() =>
      guard.canActivate(contextFor(OpenController, 'adminOnly', member)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor(OpenController, 'staff', member)),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when a route is both @Public and @Roles', () => {
    expect(() =>
      guard.canActivate(contextFor(OpenController, 'contradictory')),
    ).toThrow(UnauthorizedException);
  });

  it('applies controller-level @Roles, and lets a method-level @Roles override it', () => {
    expect(() =>
      guard.canActivate(contextFor(AdminController, 'inherited', member)),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(contextFor(AdminController, 'overridden', member)),
    ).toBe(true);
  });

  it('denies (throws) when reading metadata fails', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() =>
      new RolesGuard(reflector).canActivate(
        contextFor(OpenController, 'guest'),
      ),
    ).toThrow('boom');
  });
});
