// Imported first by main.ts so it runs before Nest, Express and pg are loaded;
// instrumentations can only patch modules required after them.
import 'dotenv/config';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace';
import { traceStore } from './trace-store';

// Polling endpoints for the telemetry UI itself would drown out real traffic
const UNTRACED_PATHS = ['/metrics', '/observability', '/health', '/api/docs'];

const spanProcessors: SpanProcessor[] = [
  new SimpleSpanProcessor({ exporter: traceStore }),
];
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
if (otlpEndpoint) {
  spanProcessors.push(
    new BatchSpanProcessor({
      exporter: new OTLPTraceExporter({ url: otlpEndpoint }),
    }),
  );
}

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'libraflow-api',
  spanProcessors,
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) =>
        UNTRACED_PATHS.some((path) => request.url?.startsWith(path)),
    }),
    // Only queries made while handling a request or job; skips the pool's own chatter
    new PgInstrumentation({ requireParentSpan: true }),
  ],
});

sdk.start();

// Flush spans on shutdown, but let Nest's shutdown hooks decide when the process exits
process.once('SIGTERM', () => void sdk.shutdown());
