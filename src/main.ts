// Must stay the first import: it patches http and pg before anything loads them
import './common/observability/instrumentation';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, DEFAULT_API_VERSION } from './app.setup';
import { appLogger } from './common/observability/app-logger';

async function bootstrap() {
  const app = configureApp(
    await NestFactory.create(AppModule, { logger: appLogger }),
  );
  app.enableShutdownHooks();
  // Leave a trace of why the API stopped; Nest's own handlers run after this one
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.prependOnceListener(signal, () =>
      appLogger.warn(`Received ${signal}, shutting down`, 'Bootstrap'),
    );
  }

  const config = new DocumentBuilder()
    .setTitle('LibraFlow API')
    .setDescription('Library Management System API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  appLogger.log(
    `LibraFlow API on http://localhost:${port}/${API_PREFIX}/v${DEFAULT_API_VERSION} (docs at /api/docs, metrics at /metrics)`,
    'Bootstrap',
  );
}
void bootstrap();
