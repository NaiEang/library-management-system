import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import type { AuthedRequest } from '../rbac/auth-user';
import { tracer } from './with-span';

/**
 * Names the HTTP server span after the matched route (OTel's Nest plugin does not
 * support Nest 12 yet) and wraps the handler in a `Controller.method` span, so
 * service spans and pg queries nest under it in the waterfall.
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const route = `${request.baseUrl ?? ''}${request.route?.path ?? request.path}`;
    request.telemetryRoute = route;

    const serverSpan = trace.getActiveSpan();
    serverSpan?.updateName(`${request.method} ${route}`);
    serverSpan?.setAttribute('http.route', route);
    if (request.user) {
      serverSpan?.setAttributes({
        'enduser.id': request.user.id,
        'enduser.role': request.user.role,
      });
    }

    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    return new Observable((subscriber) => {
      tracer.startActiveSpan(
        `${controller}.${handler}`,
        {
          attributes: {
            'code.namespace': controller,
            'code.function': handler,
          },
        },
        (span) => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (error: unknown) => {
              const status =
                error instanceof HttpException ? error.getStatus() : 500;
              span.setAttribute('http.response.status_code', status);
              if (status >= 500) {
                span.recordException(error as Error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: (error as Error).message,
                });
              }
              span.end();
              subscriber.error(error);
            },
            complete: () => {
              span.end();
              subscriber.complete();
            },
          });
        },
      );
    });
  }
}
