import { SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import {
  ExportResultCode,
  hrTimeToMilliseconds,
  type ExportResult,
} from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

export interface StoredSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  scope: string;
  startMs: number;
  durationMs: number;
  status: 'UNSET' | 'OK' | 'ERROR';
  statusMessage?: string;
  attributes: Attributes;
  events: { name: string; timeMs: number; attributes?: Attributes }[];
}

export interface TraceSummary {
  traceId: string;
  rootName: string;
  method?: string;
  route?: string;
  statusCode?: number;
  startMs: number;
  durationMs: number;
  spanCount: number;
  dbSpanCount: number;
  hasError: boolean;
  userId?: string;
  userRole?: string;
}

const MAX_TRACES = 500;

/**
 * Keeps the most recent traces in memory so the local dashboard can show them
 * without running Jaeger/Tempo. It is a regular SpanExporter, so swapping it for
 * an OTLP exporter later needs no changes in application code.
 */
class InMemoryTraceStore implements SpanExporter {
  // Map keeps insertion order, which makes oldest-first eviction cheap
  private readonly traces = new Map<string, StoredSpan[]>();

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      const stored = toStoredSpan(span);
      const existing = this.traces.get(stored.traceId);
      if (existing) {
        existing.push(stored);
      } else {
        this.traces.set(stored.traceId, [stored]);
        if (this.traces.size > MAX_TRACES) {
          const oldest = this.traces.keys().next().value;
          if (oldest) this.traces.delete(oldest);
        }
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {
    this.traces.clear();
  }

  async forceFlush(): Promise<void> {}

  list(
    filter: {
      route?: string;
      errorsOnly?: boolean;
      minDurationMs?: number;
      limit?: number;
    } = {},
  ): TraceSummary[] {
    const summaries: TraceSummary[] = [];
    for (const [traceId, spans] of this.traces) {
      const summary = summarize(traceId, spans);
      // A trace only shows up once its root (the HTTP server span) has ended
      if (!summary) continue;
      if (
        filter.route &&
        !`${summary.method} ${summary.route} ${summary.rootName}`.includes(
          filter.route,
        )
      )
        continue;
      if (filter.errorsOnly && !summary.hasError) continue;
      if (filter.minDurationMs && summary.durationMs < filter.minDurationMs)
        continue;
      summaries.push(summary);
    }
    summaries.sort((a, b) => b.startMs - a.startMs);
    return summaries.slice(0, filter.limit ?? 100);
  }

  get(
    traceId: string,
  ): { summary: TraceSummary | null; spans: StoredSpan[] } | null {
    const spans = this.traces.get(traceId);
    if (!spans) return null;
    return {
      summary: summarize(traceId, spans),
      spans: [...spans].sort((a, b) => a.startMs - b.startMs),
    };
  }
}

function toStoredSpan(span: ReadableSpan): StoredSpan {
  const context = span.spanContext();
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: SpanKind[span.kind],
    scope: span.instrumentationScope.name,
    startMs: hrTimeToMilliseconds(span.startTime),
    durationMs: hrTimeToMilliseconds(span.duration),
    status: SpanStatusCode[span.status.code] as StoredSpan['status'],
    statusMessage: span.status.message,
    attributes: span.attributes,
    events: span.events.map((event) => ({
      name: event.name,
      timeMs: hrTimeToMilliseconds(event.time),
      attributes: event.attributes,
    })),
  };
}

function summarize(traceId: string, spans: StoredSpan[]): TraceSummary | null {
  // Only a true root counts: until it ends, the trace is still in flight and stays hidden.
  // Roots are HTTP server spans or background jobs such as the overdue cron.
  const root = spans.find((span) => !span.parentSpanId);
  if (!root) return null;

  const attrs = root.attributes;
  return {
    traceId,
    rootName: root.name,
    method: (attrs['http.request.method'] ?? attrs['http.method']) as
      string | undefined,
    route: (attrs['http.route'] ??
      attrs['url.path'] ??
      attrs['http.target']) as string | undefined,
    statusCode: (attrs['http.response.status_code'] ??
      attrs['http.status_code']) as number | undefined,
    startMs: root.startMs,
    durationMs: root.durationMs,
    spanCount: spans.length,
    dbSpanCount: spans.filter(
      (span) =>
        span.attributes['db.system'] || span.attributes['db.system.name'],
    ).length,
    hasError: spans.some((span) => span.status === 'ERROR'),
    userId: attrs['enduser.id'] as string | undefined,
    userRole: attrs['enduser.role'] as string | undefined,
  };
}

export const traceStore = new InMemoryTraceStore();
