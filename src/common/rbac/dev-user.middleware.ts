import type { NextFunction, Response } from 'express';
import type { DataSource } from 'typeorm';
import type { RoleName } from '../constants';
import type { AuthedRequest, AuthUser } from './auth-user';

export const devAuthEnabled = () => process.env.DEV_AUTH === 'true';

/**
 * Stand-in until JWT login lands: with DEV_AUTH=true, an `x-user-id` header picks the
 * acting user. Never enable it outside local dev and tests. A real `request.user` wins.
 */
export function devUser(dataSource: DataSource) {
  return async (
    request: AuthedRequest,
    _response: Response,
    next: NextFunction,
  ) => {
    const userId = request.header('x-user-id');
    if (!devAuthEnabled() || request.user || !userId || !/^\d+$/.test(userId))
      return next();
    try {
      const [user] = await dataSource.query<AuthUser[]>(
        `SELECT u.id, u.username, r.name AS role
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND u.status = 'active'`,
        [userId],
      );
      if (user) request.user = { ...user, role: user.role as RoleName };
      next();
    } catch (error) {
      next(error);
    }
  };
}
