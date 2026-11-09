import { SetMetadata } from '@nestjs/common';

export interface LogActivityOptions {
  /** Defaults to CREATE / UPDATE / DELETE from the HTTP method. */
  action?: string;
  /** Defaults to the controller path in singular PascalCase (`loans` becomes `Loan`). */
  entityType?: string;
  /** For handlers that write their own row, e.g. login. */
  skip?: boolean;
}

export const LOG_ACTIVITY_KEY = 'logActivity';

/**
 * Tunes what the ActivityLogInterceptor records for a handler or a whole controller,
 * e.g. `@LogActivity({ action: 'APPROVE' })` on `PATCH /loans/:id/approve`.
 */
export const LogActivity = (options: LogActivityOptions) =>
  SetMetadata(LOG_ACTIVITY_KEY, options);
