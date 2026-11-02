import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { mergeMap, Observable } from 'rxjs';
import { RoleName } from '../common/constants';
import type { AuthedRequest } from '../common/rbac/auth-user';
import { ActivityLogsService } from './activity-logs.service';
import {
  LOG_ACTIVITY_KEY,
  type LogActivityOptions,
} from './log-activity.decorator';

const STAFF_ROLES = new Set<RoleName>([RoleName.ADMIN, RoleName.LIBRARIAN]);
const ACTION_BY_METHOD: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};
// The first of these found on the handler's result names the row, e.g. "Clean Code" or "LN-000812"
const LABEL_FIELDS = [
  'title',
  'name',
  'loanCode',
  'memberCode',
  'paymentCode',
  'copyCode',
  'username',
];

/**
 * Records every successful write by an admin or librarian in activity_logs, with no
 * code in the handlers. @LogActivity renames the action or entity, or opts a handler out.
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly activityLogs: ActivityLogsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    const options: LogActivityOptions = {
      ...this.reflector.get<LogActivityOptions | undefined>(
        LOG_ACTIVITY_KEY,
        context.getClass(),
      ),
      ...this.reflector.get<LogActivityOptions | undefined>(
        LOG_ACTIVITY_KEY,
        context.getHandler(),
      ),
    };
    const action = options.action ?? ACTION_BY_METHOD[request.method];
    if (!user || !STAFF_ROLES.has(user.role) || !action || options.skip)
      return next.handle();

    const entityType =
      options.entityType ??
      entityTypeOf(Reflect.getMetadata(PATH_METADATA, context.getClass()));
    const paramId =
      typeof request.params.id === 'string' ? request.params.id : null;

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const record =
          result && typeof result === 'object'
            ? (result as Record<string, unknown>)
            : undefined;
        await this.activityLogs.record({
          user,
          action,
          entityType,
          entityId: idOf(record) ?? paramId,
          label: labelOf(record),
          ipAddress: clientIp(request),
        });
        return result;
      }),
    );
  }
}

function entityTypeOf(path: unknown): string {
  const first = (Array.isArray(path) ? path[0] : path) as string | undefined;
  const segment = first?.split('/').filter(Boolean).pop() ?? 'Resource';
  const singular = segment.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
  return singular
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// bigint ids arrive as strings from pg, but a handler may build its own result
function idOf(record: Record<string, unknown> | undefined): string | null {
  const id = record?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

function labelOf(record: Record<string, unknown> | undefined): string | null {
  const field = LABEL_FIELDS.find((key) => typeof record?.[key] === 'string');
  return field ? (record![field] as string) : null;
}

function clientIp(request: AuthedRequest): string | null {
  const ip = (request.ip ?? request.socket.remoteAddress ?? '').replace(
    /^::ffff:/,
    '',
  );
  return ip ? ip.slice(0, 45) : null;
}
