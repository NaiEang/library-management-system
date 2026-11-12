import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { MetricsService } from './common/observability/metrics.service';
import { requestTelemetry } from './common/observability/request-telemetry.middleware';
import { TracingInterceptor } from './common/observability/tracing.interceptor';

// Every API route lives under /api/v<version> (e.g. /api/v1/auth/login), using
// Nest's URI versioning: routes are version 1 unless marked otherwise, and a
// v2 of one endpoint can be added next to it with @Version('2').
// Operational endpoints stay at the root, where Docker, Prometheus and the
// queue dashboard expect them (their controller is VERSION_NEUTRAL). Swagger
// stays at /api/docs (set up in main.ts).
export const API_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';
const OUTSIDE_API_PREFIX = [
  'health',
  'metrics',
  'observability/{*path}',
  'queues',
  'queues/{*path}',
];

export function useApiPrefix<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX, { exclude: OUTSIDE_API_PREFIX });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
  return app;
}

/** Shared by main.ts and the E2E tests so both boot the exact same pipeline. */
export function configureApp<T extends INestApplication>(app: T): T {
  useApiPrefix(app);
  // Security headers on every response (Nest's built-in, the same defaults as
  // helmet 8). First, so even 404s and errors carry them.
  app.useSecurityHeaders();
  app.enableCors();
  app.use(requestTelemetry(app.get(MetricsService)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // Registered here so it wraps every other interceptor, including the activity log write
  app.useGlobalInterceptors(new TracingInterceptor());
  return app;
}
