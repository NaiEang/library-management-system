import { HttpException } from '@nestjs/common';
import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';

export const tracer = trace.getTracer('libraflow-api');

/** Runs `fn` inside a child span so business steps show up in the trace waterfall. */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      // A 4xx is the caller's mistake (limit reached, not found), not a failure of this service
      if (error instanceof HttpException && error.getStatus() < 500) {
        span.addEvent('rejected', {
          'http.response.status_code': error.getStatus(),
          'error.message': error.message,
        });
      } else {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
