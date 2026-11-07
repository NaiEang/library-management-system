import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../common/rbac/auth-user';
import { ActivityLog } from './entities/activity-log.entity';
import { MetricsService } from '../common/observability/metrics.service';
import { withSpan } from '../common/observability/with-span';
import { describeActivity } from './describe-activity';
import type { ActivityLogQueryDto } from './dto/activity-log-query.dto';

export interface ActivityEntry {
  user: Pick<AuthUser, 'id' | 'username'>;
  action: string;
  entityType: string;
  entityId?: string | null;
  label?: string | null;
  ipAddress?: string | null;
  /** Overrides the generated sentence. */
  description?: string;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger('ActivityLog');

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logs: Repository<ActivityLog>,
    private readonly metrics: MetricsService,
  ) {}

  /** Also callable directly, e.g. `record({ user, action: 'LOGIN', entityType: 'User', entityId: user.id })`. */
  async record(entry: ActivityEntry): Promise<string | null> {
    const labels = { action: entry.action, entity_type: entry.entityType };
    const description =
      entry.description ??
      describeActivity({
        username: entry.user.username,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        label: entry.label,
      });
    try {
      const id = await withSpan(
        'activity_log.write',
        async () => {
          const { identifiers } = await this.logs.insert({
            userId: entry.user.id,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            description,
            ipAddress: entry.ipAddress ?? null,
          });
          return String(identifiers[0]?.id);
        },
        {
          'activity.action': entry.action,
          'activity.entity_type': entry.entityType,
          'enduser.id': entry.user.id,
        },
      );
      this.metrics.activityLogsWritten.inc({ ...labels, outcome: 'written' });
      this.logger.log(description, { activityLogId: id });
      return id;
    } catch (error) {
      // The staff action already succeeded; a missing audit row must not turn it into a 500
      this.metrics.activityLogsWritten.inc({ ...labels, outcome: 'failed' });
      this.logger.error(
        `Could not record "${description}": ${(error as Error).message}`,
        (error as Error).stack,
      );
      return null;
    }
  }

  async findAll(query: ActivityLogQueryDto) {
    const { page, limit } = query;
    const qb = this.logs
      .createQueryBuilder('log')
      .leftJoin('log.user', 'user')
      .leftJoin('user.role', 'role')
      .select([
        'log',
        'user.id',
        'user.username',
        'user.firstName',
        'user.lastName',
        'role.id',
        'role.name',
      ])
      .orderBy('log.createdAt', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.action)
      qb.andWhere('log.action = :action', { action: query.action });
    if (query.entityType)
      qb.andWhere('log.entityType = :entityType', {
        entityType: query.entityType,
      });
    if (query.userId)
      qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.role) qb.andWhere('role.name = :role', { role: query.role });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('log.createdAt <= :to', { to: query.to });
    if (query.search) {
      qb.andWhere(
        '(log.description ILIKE :search OR user.username ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map(({ user, ...log }) => ({
        ...log,
        user: user && {
          id: user.id,
          username: user.username,
          name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          role: user.role?.name,
        },
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Values for the filter dropdowns, most common first. */
  async facets() {
    const countBy = (column: 'action' | 'entityType') =>
      this.logs
        .createQueryBuilder('log')
        .select(`log.${column}`, 'value')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy(`log.${column}`)
        .orderBy('count', 'DESC')
        .getRawMany<{ value: string; count: number }>();
    const [actions, entityTypes] = await Promise.all([
      countBy('action'),
      countBy('entityType'),
    ]);
    return { actions, entityTypes };
  }
}
