import { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { RoleName } from '../common/constants';
import type { MetricsService } from '../common/observability/metrics.service';
import { ActivityLogsService } from './activity-logs.service';
import type { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import type { ActivityLog } from './entities/activity-log.entity';

const librarian = { id: '2', username: 'desk.librarian' };

interface Call {
  method: string;
  args: unknown[];
}

/** A chainable stand-in for TypeORM's query builder that remembers every call. */
function fakeQueryBuilder(results: {
  rows?: unknown[];
  total?: number;
  raw?: (calls: Call[]) => unknown[];
}) {
  const calls: Call[] = [];
  const qb: Record<string, unknown> = {};
  for (const method of [
    'leftJoin',
    'select',
    'addSelect',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'skip',
    'take',
    'andWhere',
  ]) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    };
  }
  qb.getManyAndCount = () =>
    Promise.resolve([results.rows ?? [], results.total ?? 0]);
  qb.getRawMany = () => Promise.resolve(results.raw?.(calls) ?? []);
  return { qb, calls };
}

function setup(repo: Partial<Record<keyof Repository<ActivityLog>, unknown>>) {
  const inc = vi.fn();
  const metrics = {
    activityLogsWritten: { inc },
  } as unknown as MetricsService;
  const service = new ActivityLogsService(
    repo as unknown as Repository<ActivityLog>,
    metrics,
  );
  return { service, inc };
}

function query(overrides: Partial<ActivityLogQueryDto> = {}) {
  return { page: 1, limit: 20, ...overrides } as ActivityLogQueryDto;
}

describe('ActivityLogsService', () => {
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('record', () => {
    it('inserts a row with a readable description and returns its id', async () => {
      const insert = vi.fn(() =>
        Promise.resolve({ identifiers: [{ id: '41' }] }),
      );
      const { service, inc } = setup({ insert });

      const id = await service.record({
        user: librarian,
        action: 'APPROVE',
        entityType: 'Loan',
        entityId: '812',
        label: 'LN-000812',
        ipAddress: '10.0.0.7',
      });

      expect(id).toBe('41');
      expect(insert).toHaveBeenCalledExactlyOnceWith({
        userId: '2',
        action: 'APPROVE',
        entityType: 'Loan',
        entityId: '812',
        description: 'desk.librarian approved Loan #812 "LN-000812"',
        ipAddress: '10.0.0.7',
      });
      expect(inc).toHaveBeenCalledExactlyOnceWith({
        action: 'APPROVE',
        entity_type: 'Loan',
        outcome: 'written',
      });
    });

    it('stores null for a missing id and IP, and keeps a description it is given', async () => {
      const insert = vi.fn(() =>
        Promise.resolve({ identifiers: [{ id: '42' }] }),
      );
      const { service } = setup({ insert });

      await service.record({
        user: librarian,
        action: 'EXPORT',
        entityType: 'Report',
        description: 'desk.librarian exported the overdue list',
      });

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: null,
          ipAddress: null,
          description: 'desk.librarian exported the overdue list',
        }),
      );
    });

    it('never fails the staff action: a failed insert is logged, counted and returns null', async () => {
      const insert = vi.fn(() =>
        Promise.reject(new Error('connection terminated')),
      );
      const { service, inc } = setup({ insert });

      await expect(
        service.record({
          user: librarian,
          action: 'DELETE',
          entityType: 'Book',
        }),
      ).resolves.toBeNull();

      expect(inc).toHaveBeenCalledExactlyOnceWith({
        action: 'DELETE',
        entity_type: 'Book',
        outcome: 'failed',
      });
      expect(logError).toHaveBeenCalledWith(
        'Could not record "desk.librarian deleted Book": connection terminated',
        expect.any(String),
      );
    });
  });

  describe('findAll', () => {
    it('pages newest first and flattens the user into id, username, name and role', async () => {
      const { qb, calls } = fakeQueryBuilder({
        total: 23,
        rows: [
          {
            id: '5',
            action: 'CREATE',
            entityType: 'Book',
            user: {
              id: '2',
              username: 'desk.librarian',
              firstName: 'Dara',
              lastName: 'Sok',
              role: { id: '2', name: RoleName.LIBRARIAN },
            },
          },
          {
            id: '4',
            action: 'UPDATE',
            entityType: 'Book',
            user: {
              id: '1',
              username: 'admin',
              firstName: 'Admin',
              lastName: null,
              role: { id: '1', name: RoleName.ADMIN },
            },
          },
          { id: '3', action: 'DELETE', entityType: 'Book', user: null },
        ],
      });
      const { service } = setup({ createQueryBuilder: () => qb });

      const result = await service.findAll(query({ page: 2, limit: 10 }));

      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 23,
        totalPages: 3,
      });
      expect(result.data).toEqual([
        {
          id: '5',
          action: 'CREATE',
          entityType: 'Book',
          user: {
            id: '2',
            username: 'desk.librarian',
            name: 'Dara Sok',
            role: RoleName.LIBRARIAN,
          },
        },
        {
          id: '4',
          action: 'UPDATE',
          entityType: 'Book',
          user: {
            id: '1',
            username: 'admin',
            name: 'Admin',
            role: RoleName.ADMIN,
          },
        },
        { id: '3', action: 'DELETE', entityType: 'Book', user: null },
      ]);
      expect(calls).toContainEqual({
        method: 'orderBy',
        args: ['log.createdAt', 'DESC'],
      });
      expect(calls).toContainEqual({
        method: 'addOrderBy',
        args: ['log.id', 'DESC'],
      });
      expect(calls).toContainEqual({ method: 'skip', args: [10] });
      expect(calls).toContainEqual({ method: 'take', args: [10] });
      expect(calls.filter((call) => call.method === 'andWhere')).toEqual([]);
    });

    it('adds one condition per filter it is given', async () => {
      const { qb, calls } = fakeQueryBuilder({});
      const { service } = setup({ createQueryBuilder: () => qb });

      await service.findAll(
        query({
          action: 'APPROVE',
          entityType: 'Loan',
          userId: '2',
          role: RoleName.LIBRARIAN,
          from: '2026-11-01T00:00:00Z',
          to: '2026-11-10T00:00:00Z',
          search: 'clean code',
        }),
      );

      expect(
        calls.filter((call) => call.method === 'andWhere').map((c) => c.args),
      ).toEqual([
        ['log.action = :action', { action: 'APPROVE' }],
        ['log.entityType = :entityType', { entityType: 'Loan' }],
        ['log.userId = :userId', { userId: '2' }],
        ['role.name = :role', { role: RoleName.LIBRARIAN }],
        ['log.createdAt >= :from', { from: '2026-11-01T00:00:00Z' }],
        ['log.createdAt <= :to', { to: '2026-11-10T00:00:00Z' }],
        [
          '(log.description ILIKE :search OR user.username ILIKE :search)',
          { search: '%clean code%' },
        ],
      ]);
    });

    it('reports zero pages when nothing matches', async () => {
      const { qb } = fakeQueryBuilder({ rows: [], total: 0 });
      const { service } = setup({ createQueryBuilder: () => qb });

      const result = await service.findAll(query());

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });
  });

  describe('facets', () => {
    it('counts actions and entity types for the filter dropdowns', async () => {
      const actions = [
        { value: 'UPDATE', count: 9 },
        { value: 'CREATE', count: 4 },
      ];
      const entityTypes = [{ value: 'Loan', count: 13 }];
      const builders: Call[][] = [];
      const { service } = setup({
        createQueryBuilder: () => {
          const { qb, calls } = fakeQueryBuilder({
            raw: (made) =>
              made[0].args[0] === 'log.action' ? actions : entityTypes,
          });
          builders.push(calls);
          return qb;
        },
      });

      await expect(service.facets()).resolves.toEqual({ actions, entityTypes });
      for (const calls of builders) {
        expect(calls).toContainEqual({
          method: 'orderBy',
          args: ['count', 'DESC'],
        });
      }
    });
  });
});
