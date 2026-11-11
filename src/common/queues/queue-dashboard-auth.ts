import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface QueueDashboardCredentials {
  user: string;
  password: string;
}

// The queue dashboard is plain Express middleware, so the app's JWT guard
// never sees it. It is off (404) until QUEUE_DASHBOARD_PASSWORD is set, and
// then asks the browser for HTTP Basic credentials.
export function queueDashboardAuth(credentials: QueueDashboardCredentials) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!credentials.password) {
      res.status(404).send('Not Found');
      return;
    }
    if (matches(req.headers.authorization, credentials)) {
      next();
      return;
    }
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="LibraFlow queues", charset="UTF-8"')
      .send('Authentication required');
  };
}

function matches(header: string | undefined, expected: QueueDashboardCredentials): boolean {
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;
  // Hash both sides so the comparison is constant-time whatever the lengths
  return (
    sameSecret(decoded.slice(0, colon), expected.user) &&
    sameSecret(decoded.slice(colon + 1), expected.password)
  );
}

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
