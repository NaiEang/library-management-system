import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { MetricsService } from './common/observability/metrics.service';
import { requestTelemetry } from './common/observability/request-telemetry.middleware';
import { TracingInterceptor } from './common/observability/tracing.interceptor';

/** Shared by main.ts and the E2E tests so both boot the exact same pipeline. */
export function configureApp<T extends INestApplication>(app: T): T {
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
