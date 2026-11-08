import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { devUser } from './common/rbac/dev-user.middleware';
import { MetricsService } from './common/observability/metrics.service';
import { requestTelemetry } from './common/observability/request-telemetry.middleware';
import { TracingInterceptor } from './common/observability/tracing.interceptor';

/** Shared by main.ts and the E2E tests so both boot the exact same pipeline. */
export function configureApp<T extends INestApplication>(app: T): T {
  app.enableCors();
  app.use(requestTelemetry(app.get(MetricsService)));
  app.use(devUser(app.get(DataSource)));
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
