import { useApi } from '../api';
import { BarList, ColumnChart, LineChart } from '../components/charts';
import { Card, ErrorBox, PageHead, StatTile, Status } from '../components/ui';
import { formatMs, formatNumber, formatTime, humanize } from '../format';
import type { MetricsSummary } from '../types';

const THROUGHPUT = [
  { key: 'ok', label: '2xx/3xx', color: 'var(--series-1)' },
  { key: 'errors4xx', label: '4xx', color: 'var(--series-2)' },
  { key: 'errors5xx', label: '5xx', color: 'var(--series-3)' },
];
const LATENCY = [
  { key: 'p50', label: 'p50', color: 'var(--series-1)' },
  { key: 'p95', label: 'p95', color: 'var(--series-2)' },
];

const minute = (t: string | number) =>
  new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function uptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
}

export function MetricsPage() {
  const { data, error } = useApi<MetricsSummary>('/observability/metrics', 5_000);
  // Start at the first minute with traffic: empty minutes would plot as 0ms latency
  const firstActive = data?.series.findIndex((point) => point.requests > 0) ?? -1;
  const active = data?.series.slice(Math.max(0, Math.min(firstActive, data.series.length - 2))) ?? [];
  const series = active.map((point) => ({ ...point, ok: point.requests - point.errors4xx - point.errors5xx }));

  return (
    <>
      <PageHead
        title="Metrics"
        sub={
          <>
            RED metrics from the request middleware · Prometheus scrape target at{' '}
            <a href="/api/metrics" target="_blank" rel="noreferrer">
              /metrics
            </a>
            {data && ` · ${formatTime(data.generatedAt)}`}
          </>
        }
      />
      <ErrorBox error={error} />
      {data && (
        <div className="stack">
          <div className="grid tiles">
            <StatTile
              label="Requests / min"
              value={data.kpis.rpm5m}
              foot={`${formatNumber(data.kpis.requests15m)} in last 15 min`}
            />
            <StatTile
              label="p95 latency"
              value={formatMs(data.kpis.p95)}
              status={data.kpis.p95 > 500 ? { kind: 'warning', label: 'Above 500ms' } : undefined}
              foot={`p50 ${formatMs(data.kpis.p50)} · p99 ${formatMs(data.kpis.p99)}`}
            />
            <StatTile
              label="Server errors (5xx)"
              value={`${data.kpis.errorRate15m}%`}
              status={
                data.kpis.errorRate15m >= 5
                  ? { kind: 'critical', label: 'High error rate' }
                  : data.kpis.errorRate15m > 1
                    ? { kind: 'warning', label: 'Elevated' }
                    : { kind: 'good', label: 'Healthy' }
              }
            />
            <StatTile
              label="Client errors (4xx)"
              value={`${data.kpis.clientErrorRate15m}%`}
              foot="Validation, auth, limits"
            />
          </div>

          <div className="grid two">
            <Card title="Throughput" sub="Requests per minute, last 30 min">
              <ColumnChart
                data={series}
                xKey="t"
                series={THROUGHPUT}
                formatX={minute}
                ariaLabel="Requests per minute split by status class"
              />
            </Card>
            <Card title="Latency" sub="Per minute, milliseconds">
              <LineChart
                data={active}
                xKey="t"
                series={LATENCY}
                formatX={minute}
                formatY={(n) => `${n}`}
                ariaLabel="p50 and p95 latency per minute"
              />
            </Card>
          </div>

          <Card title="Routes" sub="Last 60 minutes · click a route to see its traces">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Route</th>
                    <th className="num">Requests</th>
                    <th className="num">4xx</th>
                    <th className="num">5xx</th>
                    <th className="num">p50</th>
                    <th className="num">p95</th>
                    <th className="num">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.map((route) => (
                    <tr
                      key={route.route}
                      className="clickable"
                      onClick={() =>
                        (window.location.hash = `#/observability/traces?route=${encodeURIComponent(route.route)}`)
                      }
                    >
                      <td className="mono">{route.route}</td>
                      <td className="num">{formatNumber(route.count)}</td>
                      <td className="num">{route.clientErrors || <span className="muted">0</span>}</td>
                      <td className="num">
                        {route.errors ? (
                          <Status kind="critical">{route.errors}</Status>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td className="num">{formatMs(route.p50)}</td>
                      <td className="num">{formatMs(route.p95)}</td>
                      <td className="num">{formatMs(route.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.routes.length && <div className="empty">No traffic yet. Run `npm run simulate`</div>}
            </div>
          </Card>

          <div className="grid two">
            <Card title="Loan items by status" sub="libraflow_loan_items gauge, read on each scrape">
              <BarList
                rows={Object.entries(data.business.loanItemsByStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => ({ key, label: humanize(key), value }))}
              />
            </Card>
            <Card title="Activity log writes" sub="By ActivityLogInterceptor, since API start">
              <BarList
                rows={Object.entries(data.business.activityLogsWritten)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => ({ key, label: humanize(key), value }))}
                empty="No staff writes since the API started"
              />
            </Card>
          </div>

          <div className="grid tiles">
            <StatTile label="Uptime" value={uptime(data.process.uptimeSec)} />
            <StatTile
              label="Memory (RSS)"
              value={`${data.process.rssMb} MB`}
              foot={`Heap ${data.process.heapUsedMb} MB`}
            />
            <StatTile
              label="Event loop p99"
              value={`${data.process.eventLoopP99Ms} ms`}
              status={data.process.eventLoopP99Ms > 100 ? { kind: 'warning', label: 'Loop is lagging' } : undefined}
            />
            <StatTile
              label="Overdue loan items"
              value={data.business.overdueItems}
              foot="libraflow_overdue_loan_items gauge"
            />
          </div>
        </div>
      )}
    </>
  );
}
