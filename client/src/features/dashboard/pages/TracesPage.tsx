import { useEffect, useMemo, useState } from 'react';
import { useQueryParam } from '../../../router';
import { useApi } from '../api';
import { Card, ErrorBox, HttpStatus, PageHead, RoleBadge, Status } from '../components/ui';
import { formatMs, formatRelative } from '../format';
import type { TraceSummary } from '../types';

export function TracesPage() {
  const routeParam = useQueryParam('route');
  const [route, setRoute] = useState(routeParam ?? '');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [slowOnly, setSlowOnly] = useState(false);
  const [live, setLive] = useState(true);

  useEffect(() => setRoute(routeParam ?? ''), [routeParam]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (route) params.set('route', route);
    if (errorsOnly) params.set('errorsOnly', 'true');
    if (slowOnly) params.set('minDurationMs', '300');
    return `/observability/traces?${params}`;
  }, [route, errorsOnly, slowOnly]);
  const { data, error } = useApi<TraceSummary[]>(path, live ? 4_000 : undefined);
  const maxDuration = Math.max(1, ...(data ?? []).map((trace) => trace.durationMs));

  return (
    <>
      <PageHead
        title="Traces"
        sub="OpenTelemetry spans kept in memory (latest 500) · HTTP, handler, service and Postgres"
      />
      <div className="filters">
        <input
          className="control"
          type="search"
          placeholder="Filter by route, e.g. GET /dashboard/stats"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Errors only
        </label>
        <label className="check">
          <input type="checkbox" checked={slowOnly} onChange={(e) => setSlowOnly(e.target.checked)} /> Slower than 300ms
        </label>
        <label className="check">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live
        </label>
      </div>
      <ErrorBox error={error} />
      <Card title={data ? `${data.length} traces` : 'Loading…'} sub="Newest first">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th style={{ width: '30%' }}>Duration</th>
                <th className="num">Spans</th>
                <th className="num">DB</th>
                <th>Caller</th>
                <th className="num">When</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((trace) => (
                <tr
                  key={trace.traceId}
                  className="clickable"
                  onClick={() => (window.location.hash = `#/observability/traces/${trace.traceId}`)}
                >
                  <td>
                    <div className="mono">{trace.rootName}</div>
                    {trace.hasError && <Status kind="critical">error span</Status>}
                  </td>
                  <td>
                    <HttpStatus code={trace.statusCode} />
                  </td>
                  <td>
                    <div className="barlist-track">
                      <div
                        className="barlist-bar"
                        style={{ width: `calc((100% - 64px) * ${trace.durationMs / maxDuration})`, height: 10 }}
                      />
                      <span className="barlist-value">{formatMs(trace.durationMs)}</span>
                    </div>
                  </td>
                  <td className="num">{trace.spanCount}</td>
                  <td className="num">{trace.dbSpanCount}</td>
                  <td>{trace.userRole ? <RoleBadge role={trace.userRole} /> : <span className="muted">—</span>}</td>
                  <td className="num muted">{formatRelative(trace.startMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.length && (
            <div className="empty">No traces match. Generate traffic with `npm run simulate`</div>
          )}
        </div>
      </Card>
    </>
  );
}
