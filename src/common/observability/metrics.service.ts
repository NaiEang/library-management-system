import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { DataSource } from 'typeorm';

interface RequestSample {
  t: number;
  method: string;
  route: string;
  status: number;
  ms: number;
}

type CountRow = { status: string; count: number };

const SAMPLE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpDuration = new Histogram({
    name: 'http_server_request_duration_seconds',
    help: 'HTTP request latency by route',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  private readonly httpRequests = new Counter({
    name: 'http_server_requests_total',
    help: 'HTTP requests by route and status',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly activityLogsWritten = new Counter({
    name: 'libraflow_activity_logs_written_total',
    help: 'Activity log rows written for staff actions',
    labelNames: ['action', 'entity_type', 'outcome'],
    registers: [this.registry],
  });

  private readonly samples: RequestSample[] = [];
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });

  constructor(private readonly dataSource: DataSource) {
    collectDefaultMetrics({ register: this.registry });
    this.loopDelay.enable();
    this.registerBusinessGauges();
  }

  recordRequest(method: string, route: string, status: number, ms: number) {
    const labels = { method, route, status_code: String(status) };
    this.httpDuration.observe(labels, ms / 1000);
    this.httpRequests.inc(labels);

    const now = Date.now();
    this.samples.push({ t: now, method, route, status, ms });
    while (this.samples.length && this.samples[0].t < now - SAMPLE_WINDOW_MS)
      this.samples.shift();
  }

  /** JSON view of the same numbers for the local dashboard (Prometheus reads /metrics instead). */
  async summary() {
    const now = Date.now();
    const last15 = this.samples.filter((s) => s.t >= now - 15 * 60 * 1000);
    const last5 = last15.filter((s) => s.t >= now - 5 * 60 * 1000);
    const last15Ms = last15.map((s) => s.ms);

    const series = [];
    for (let i = 29; i >= 0; i--) {
      const start = Math.floor(now / 60000) * 60000 - i * 60000;
      const bucket = this.samples.filter(
        (s) => s.t >= start && s.t < start + 60000,
      );
      const ms = bucket.map((s) => s.ms);
      series.push({
        t: start,
        requests: bucket.length,
        errors4xx: bucket.filter((s) => s.status >= 400 && s.status < 500)
          .length,
        errors5xx: bucket.filter((s) => s.status >= 500).length,
        p50: percentile(ms, 50),
        p95: percentile(ms, 95),
      });
    }

    const routes = new Map<string, RequestSample[]>();
    for (const sample of this.samples) {
      const key = `${sample.method} ${sample.route}`;
      const list = routes.get(key);
      if (list) list.push(sample);
      else routes.set(key, [sample]);
    }

    const memory = process.memoryUsage();
    const result = {
      generatedAt: new Date(now).toISOString(),
      kpis: {
        requests15m: last15.length,
        rpm5m: +(last5.length / 5).toFixed(1),
        errorRate15m: ratio(
          last15.filter((s) => s.status >= 500).length,
          last15.length,
        ),
        clientErrorRate15m: ratio(
          last15.filter((s) => s.status >= 400 && s.status < 500).length,
          last15.length,
        ),
        p50: percentile(last15Ms, 50),
        p95: percentile(last15Ms, 95),
        p99: percentile(last15Ms, 99),
      },
      series,
      routes: [...routes.entries()]
        .map(([key, list]) => {
          const ms = list.map((s) => s.ms);
          return {
            route: key,
            count: list.length,
            errors: list.filter((s) => s.status >= 500).length,
            clientErrors: list.filter((s) => s.status >= 400 && s.status < 500)
              .length,
            p50: percentile(ms, 50),
            p95: percentile(ms, 95),
            max: Math.round(Math.max(...ms)),
          };
        })
        .sort((a, b) => b.count - a.count),
      business: {
        ...(await this.businessSnapshot()),
        activityLogsWritten: await this.activityLogTotals(),
      },
      process: {
        uptimeSec: Math.round(process.uptime()),
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        eventLoopP99Ms: +(this.loopDelay.percentile(99) / 1e6).toFixed(1),
      },
    };
    this.loopDelay.reset();
    return result;
  }

  private async businessSnapshot() {
    const [copies, items, [overdue]] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `SELECT status, COUNT(*)::int AS count FROM book_copies GROUP BY status`,
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT status, COUNT(*)::int AS count FROM loan_items GROUP BY status`,
      ),
      this.dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM loan_items
         WHERE returned_at IS NULL AND status IN ('borrowed', 'overdue') AND due_date < now()`,
      ),
    ]);
    return {
      copiesByStatus: Object.fromEntries(
        copies.map((row) => [row.status, row.count]),
      ),
      loanItemsByStatus: Object.fromEntries(
        items.map((row) => [row.status, row.count]),
      ),
      overdueItems: overdue.count,
    };
  }

  private async activityLogTotals(): Promise<Record<string, number>> {
    const { values } = await this.activityLogsWritten.get();
    const totals: Record<string, number> = {};
    for (const { labels, value } of values) {
      if (labels.outcome !== 'written') continue;
      totals[String(labels.action)] =
        (totals[String(labels.action)] ?? 0) + value;
    }
    return totals;
  }

  // Gauges are filled on each Prometheus scrape, so they always reflect the database
  private registerBusinessGauges() {
    const copies: Gauge = new Gauge({
      name: 'libraflow_book_copies',
      help: 'Book copies by status',
      labelNames: ['status'],
      registers: [this.registry],
      collect: async () => {
        const snapshot = await this.businessSnapshot();
        copies.reset();
        for (const [status, count] of Object.entries(snapshot.copiesByStatus))
          copies.set({ status }, count);
      },
    });
    const loanItems: Gauge = new Gauge({
      name: 'libraflow_loan_items',
      help: 'Loan items by status',
      labelNames: ['status'],
      registers: [this.registry],
      collect: async () => {
        const snapshot = await this.businessSnapshot();
        loanItems.reset();
        for (const [status, count] of Object.entries(
          snapshot.loanItemsByStatus,
        ))
          loanItems.set({ status }, count);
      },
    });
    const overdue: Gauge = new Gauge({
      name: 'libraflow_overdue_loan_items',
      help: 'Loan items past their due date and not yet returned',
      registers: [this.registry],
      collect: async () => {
        overdue.set((await this.businessSnapshot()).overdueItems);
      },
    });
  }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(
    sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)],
  );
}

function ratio(part: number, total: number): number {
  return total ? +((part / total) * 100).toFixed(2) : 0;
}
