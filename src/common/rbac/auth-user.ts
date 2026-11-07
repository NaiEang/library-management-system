import type { Request } from 'express';
import type { RoleName } from '../constants';

/**
 * What any auth layer must put on `request.user`. The JWT strategy should return
 * this shape so @Roles, the activity log and tracing keep working unchanged.
 */
export interface AuthUser {
  id: string;
  username: string;
  role: RoleName;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  /** Route template set by TracingInterceptor, e.g. `/loans/:id` */
  telemetryRoute?: string;
}
