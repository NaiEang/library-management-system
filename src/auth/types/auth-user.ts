import type { Request } from 'express';
import { RoleName } from '../../common/constants';

// What @CurrentUser() returns and what the guards put on request.user. Keep it
// small and stable: teammates depend on it (the activity log and tracing read
// id, username and role). Membership status is deliberately absent; read it
// from the database.
export interface AuthUser {
  id: string;
  username: string;
  role: RoleName;
  memberId?: string;
}

// A request after the guards ran. user is undefined on @Public() routes.
export interface AuthedRequest extends Request {
  user?: AuthUser;
  // Route template set by TracingInterceptor, e.g. `/loans/:id`
  telemetryRoute?: string;
}

// Access token claims. Anyone can read them, so nothing sensitive goes here.
export interface JwtPayload {
  sub: string;
  role: RoleName;
  iat?: number;
  exp?: number;
}
