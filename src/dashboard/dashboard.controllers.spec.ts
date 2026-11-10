import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { RoleName } from '../common/constants';
import { ActivityLogsController } from './activity-logs.controller';
import type { ActivityLogsService } from './activity-logs.service';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';
import type { ActivityLogQueryDto } from './dto/activity-log-query.dto';

type ControllerClass = { prototype: object };

const admin: AuthUser = { id: '1', username: 'admin', role: RoleName.ADMIN };
const librarian: AuthUser = {
  id: '2',
  username: 'desk.librarian',
  role: RoleName.LIBRARIAN,
};
const member: AuthUser = {
  id: '3',
  username: 'member.one',
  role: RoleName.MEMBER,
  memberId: '30',
};

// The same check the global RolesGuard runs before each request reaches a handler
function canCall(cls: ControllerClass, handler: string, user?: AuthUser) {
  const context = {
    getHandler: () => (cls.prototype as Record<string, unknown>)[handler],
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return new RolesGuard(new Reflector()).canActivate(context);
}

const routes: [string, ControllerClass, string][] = [
  ['GET /dashboard/stats', DashboardController, 'getStats'],
  ['GET /activity-logs', ActivityLogsController, 'findAll'],
  ['GET /activity-logs/facets', ActivityLogsController, 'facets'],
];

describe.each(routes)('%s', (_, cls, handler) => {
  it.each([
    ['an admin', admin],
    ['a librarian', librarian],
  ])('lets %s in', (__, user) => {
    expect(canCall(cls, handler, user)).toBe(true);
  });

  it('keeps members out', () => {
    expect(() => canCall(cls, handler, member)).toThrow(ForbiddenException);
  });

  it('asks guests to log in', () => {
    expect(() => canCall(cls, handler)).toThrow(UnauthorizedException);
  });
});

describe('DashboardController', () => {
  it('returns the stats from the service', async () => {
    const stats = { cards: { totalTitles: 5 } };
    const service = { getStats: vi.fn(() => Promise.resolve(stats)) };
    const controller = new DashboardController(
      service as unknown as DashboardService,
    );

    await expect(controller.getStats()).resolves.toBe(stats);
    expect(service.getStats).toHaveBeenCalledOnce();
  });
});

describe('ActivityLogsController', () => {
  it('passes the validated query to the service', async () => {
    const page = { data: [], meta: { page: 2, limit: 10, total: 0 } };
    const service = { findAll: vi.fn(() => Promise.resolve(page)) };
    const controller = new ActivityLogsController(
      service as unknown as ActivityLogsService,
    );
    const query = {
      page: 2,
      limit: 10,
      action: 'APPROVE',
    } as ActivityLogQueryDto;

    await expect(controller.findAll(query)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledExactlyOnceWith(query);
  });

  it('returns the filter values from the service', async () => {
    const facets = {
      actions: [{ value: 'CREATE', count: 3 }],
      entityTypes: [],
    };
    const service = { facets: vi.fn(() => Promise.resolve(facets)) };
    const controller = new ActivityLogsController(
      service as unknown as ActivityLogsService,
    );

    await expect(controller.facets()).resolves.toBe(facets);
  });
});
