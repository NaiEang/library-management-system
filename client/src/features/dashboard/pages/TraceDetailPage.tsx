import { useMemo, useState } from 'react';
import { useApi } from '../api';
import { Legend } from '../components/charts';
import { Card, ErrorBox, HttpStatus, PageHead, Status } from '../components/ui';
import { formatMs, formatTime } from '../format';
import type { StoredSpan, TraceDetail } from '../types';

type SpanKindGroup = 'http' | 'app' | 'db' | 'queue';

const GROUPS = [
  { key: 'http', label: 'HTTP', color: 'var(--series-1)' },
  { key: 'app', label: 'App / handler', color: 'var(--series-2)' },
  { key: 'db', label: 'Postgres & Redis', color: 'var(--series-3)' },
];

function group(span: StoredSpan): SpanKindGroup {
  if (span.attributes['db.system'] || span.attributes['db.system.name'] || span.name.startsWith('pg')) return 'db';
  if (span.attributes['messaging.system']) return 'queue';
  if (span.kind === 'SERVER' || span.kind === 'CLIENT') return 'http';
  return 'app';
}
const colorOf = (span: StoredSpan) => {
  const g = group(span);
  return g === 'http' ? 'var(--series-1)' : g === 'app' ? 'var(--series-2)' : 'var(--series-3)';
};

/** Depth-first order so children sit under their parent, like Jaeger's waterfall. */
function ordered(spans: StoredSpan[]) {
  const ids = new Set(spans.map((span) => span.spanId));
  const children = new Map<string | null, StoredSpan[]>();
  for (const span of spans) {
    const parent = span.parentSpanId && ids.has(span.parentSpanId) ? span.parentSpanId : null;
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }
  const rows: { span: StoredSpan; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const span of (children.get(parent) ?? []).sort((a, b) => a.startMs - b.startMs)) {
      rows.push({ span, depth });
      walk(span.spanId, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function TraceDetailPage({ traceId }: { traceId: string }) {
  const { data, error } = useApi<TraceDetail>(`/observability/traces/${traceId}`);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => (data ? ordered(data.spans) : []), [data]);
  const start = Math.min(...rows.map((row) => row.span.startMs));
  const end = Math.max(...rows.map((row) => row.span.startMs + row.span.durationMs));
  const total = Math.max(end - start, 0.001);
  const active = data?.spans.find((span) => span.spanId === selected) ?? rows[0]?.span;

  return (
    <>
      <PageHead title={data?.summary?.rootName ?? 'Trace'} sub={<span className="mono">{traceId}</span>}>
        <a href="#/observability/traces">← All traces</a>
      </PageHead>
      <ErrorBox error={error} />
      {data && (
        <div className="stack">
          <div className="filters" style={{ marginBottom: 0, gap: 16 }}>
            <HttpStatus code={data.summary?.statusCode} />
            <span className="secondary">{formatMs(total)} total</span>
            <span className="secondary">{data.spans.length} spans</span>
            {data.summary?.hasError && <Status kind="critical">Contains error spans</Status>}
          </div>
          <Card title="Waterfall" sub="Click a span for its attributes">
            <Legend series={GROUPS} shape="rect" />
            <div>
              {rows.map(({ span, depth }) => (
                <button
                  key={span.spanId}
                  className={`waterfall-row ${active?.spanId === span.spanId ? 'selected' : ''}`}
                  onClick={() => setSelected(span.spanId)}
                >
                  <span className="waterfall-name" style={{ paddingLeft: depth * 14 }}>
                    {span.status === 'ERROR' && <Status kind="critical">error</Status>}
                    <span title={span.name}>{span.name.replace(/\s+/g, ' ')}</span>
                  </span>
                  <span className="waterfall-track">
                    <span
                      className="waterfall-bar"
                      style={{
                        left: `${((span.startMs - start) / total) * 100}%`,
                        width: `${(span.durationMs / total) * 100}%`,
                        background: colorOf(span),
                      }}
                    />
                  </span>
                  <span className="num muted" style={{ fontSize: 12 }}>
                    {formatMs(span.durationMs)}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <div className="grid two">
            {active && (
              <Card title={active.name.replace(/\s+/g, ' ')} sub={`${active.kind} · ${active.scope}`}>
                {active.statusMessage && (
                  <div className="error-box">
                    <Status kind="critical">{active.statusMessage}</Status>
                  </div>
                )}
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {Object.entries(active.attributes).map(([key, value]) => (
                        <tr key={key}>
                          <td className="mono muted nowrap">{key}</td>
                          <td className="mono" style={{ wordBreak: 'break-all' }}>
                            {String(value)}
                          </td>
                        </tr>
                      ))}
                      {active.events.map((event, i) => (
                        <tr key={`event-${i}`}>
                          <td className="mono muted nowrap">event · {event.name}</td>
                          <td className="mono" style={{ wordBreak: 'break-all' }}>
                            {JSON.stringify(event.attributes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <Card title="Logs in this trace" sub="Correlated by trace id">
              {data.logs.length ? (
                <div style={{ margin: '0 -18px -16px' }}>
                  {data.logs.map((log) => (
                    <div key={log.id} className="log-line" style={{ gridTemplateColumns: '78px 54px 1fr' }}>
                      <span className="muted mono">{formatTime(log.time)}</span>
                      <span className="mono">{log.level}</span>
                      <span>
                        <span className="muted">[{log.context}]</span> {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">No logs were written during this trace</div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
