import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../common/constants';
import type { MembershipService } from '../../members/membership.service';
import { GoldMember } from '../decorators/gold-member.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';
import { GoldMemberGuard } from './gold-member.guard';

class OpenController {
  anyone() {}
  @GoldMember()
  goldOnly() {}
  @Public()
  @GoldMember()
  contradictory() {}
  @Roles(RoleName.LIBRARIAN)
  @GoldMember()
  staffAndGold() {}
}

@GoldMember()
class GoldController {
  inherited() {}
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

function setup(isGold: () => Promise<boolean>) {
  const spy = vi.fn(isGold);
  const guard = new GoldMemberGuard(new Reflector(), {
    isGold: spy,
  } as unknown as MembershipService);
  return { guard, isGold: spy };
}

describe('GoldMemberGuard', () => {
  it('does nothing on routes without @GoldMember (no database read)', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(false));
    await expect(
      guard.canActivate(contextFor(OpenController, 'anyone', member)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(OpenController, 'anyone')),
    ).resolves.toBe(true);
    expect(isGold).not.toHaveBeenCalled();
  });

  it('lets a gold member through, asking the database with the member id', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await expect(
      guard.canActivate(contextFor(OpenController, 'goldOnly', member)),
    ).resolves.toBe(true);
    expect(isGold).toHaveBeenCalledWith('30');
  });

  it('asks the database on every request', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await guard.canActivate(contextFor(OpenController, 'goldOnly', member));
    await guard.canActivate(contextFor(OpenController, 'goldOnly', member));
    expect(isGold).toHaveBeenCalledTimes(2);
  });

  it('answers 403 "Gold membership required" to a member who is not gold', async () => {
    const { guard } = setup(() => Promise.resolve(false));
    const attempt = guard.canActivate(
      contextFor(OpenController, 'goldOnly', member),
    );
    await expect(attempt).rejects.toThrow(ForbiddenException);
    await expect(attempt).rejects.toThrow('Gold membership required');
  });

  it('answers 403 to staff without asking the database, even with @Roles', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await expect(
      guard.canActivate(contextFor(OpenController, 'goldOnly', librarian)),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(contextFor(OpenController, 'staffAndGold', librarian)),
    ).rejects.toThrow(ForbiddenException);
    expect(isGold).not.toHaveBeenCalled();
  });

  it('answers 403 to staff by role alone, even if a member id were attached', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await expect(
      guard.canActivate(
        contextFor(OpenController, 'goldOnly', {
          ...librarian,
          memberId: '30',
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(isGold).not.toHaveBeenCalled();
  });

  it('answers 403 to a member user with no member id', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await expect(
      guard.canActivate(
        contextFor(OpenController, 'goldOnly', {
          ...member,
          memberId: undefined,
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(isGold).not.toHaveBeenCalled();
  });

  it('answers 401 when there is no user, and fails closed on @Public + @GoldMember', async () => {
    const { guard, isGold } = setup(() => Promise.resolve(true));
    await expect(
      guard.canActivate(contextFor(OpenController, 'goldOnly')),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor(OpenController, 'contradictory')),
    ).rejects.toThrow(UnauthorizedException);
    expect(isGold).not.toHaveBeenCalled();
  });

  it('applies a controller-level @GoldMember to every route in it', async () => {
    const { guard } = setup(() => Promise.resolve(false));
    await expect(
      guard.canActivate(contextFor(GoldController, 'inherited', member)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies (and does not say "not gold") when the database fails', async () => {
    const { guard } = setup(() => Promise.reject(new Error('db down')));
    const attempt = guard.canActivate(
      contextFor(OpenController, 'goldOnly', member),
    );
    await expect(attempt).rejects.toThrow('db down');
    await expect(attempt).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
