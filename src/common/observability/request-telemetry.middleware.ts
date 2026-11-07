import { context } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import type { AuthedRequest } from '../rbac/auth-user';
import { appLogger } from './app-logger';
import type { MetricsService } from './metrics.service';

const UNMEASURED_PATHS = ['/metrics', '/observability', '/health', '/api/docs'];

/**
 * Express-level so it also sees requests rejected by guards or unmatched routes,
 * which never reach Nest interceptors. Records RED metrics and one access log line.
 */
export function requestTelemetry(metrics: MetricsService) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (UNMEASURED_PATHS.some((path) => request.path.startsWith(path)))
      return next();

    const start = performance.now();
    const activeContext = context.active();

    response.on('finish', () => {
      const ms = performance.now() - start;
      const authed = request as AuthedRequest;
      const route =
        authed.telemetryRoute ??
        (request.route
          ? `${request.baseUrl}${request.route.path}`
          : 'unmatched');
      metrics.recordRequest(request.method, route, response.statusCode, ms);

      // Re-enter the request's context so the log line carries its trace id
      context.with(activeContext, () => {
        const line = `${request.method} ${request.originalUrl} ${response.statusCode} - ${ms.toFixed(1)}ms`;
        const meta = {
          route,
          status: response.statusCode,
          durationMs: +ms.toFixed(1),
          userId: authed.user?.id,
        };
        if (response.statusCode >= 500) appLogger.error(line, meta, 'HTTP');
        else if (response.statusCode >= 400) appLogger.warn(line, meta, 'HTTP');
        else appLogger.log(line, meta, 'HTTP');
      });
    });
    next();
  };
}
