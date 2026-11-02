// Mirrors roles.name on the server
export type Role = 'admin' | 'librarian' | 'member';

export interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

type CountRow = { status: string; count: number };

export interface DashboardStats {
  generatedAt: string;
  cards: {
    totalTitles: number;
    totalCopies: number;
    availableCopies: number;
    onLoan: number;
    overdue: number;
    dueSoon: number;
    pendingRequests: number;
    returnedThisMonth: number;
    activeMembers: number;
    pendingDepositMembers: number;
    blockedMembers: number;
    totalMembers: number;
    depositsHeld: number;
    finesCollected30d: number;
    depositsCollected30d: number;
    accruingFines: number;
  };
  copiesByStatus: CountRow[];
  loanItemsByStatus: CountRow[];
  loanTrend: { date: string; requested: number; borrowed: number; returned: number }[];
  topBooks: { bookId: string; title: string; authors: string; loanCount: number }[];
  categoryUsage: { category: string; loanCount: number }[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    description: string | null;
    createdAt: string;
    username: string | null;
    role: Role | null;
  }[];
}

export interface ActivityLogRow {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; username: string; name: string; role: Role } | null;
}

export interface ActivityFacets {
  actions: { value: string; count: number }[];
  entityTypes: { value: string; count: number }[];
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface MetricsSummary {
  generatedAt: string;
  kpis: {
    requests15m: number;
    rpm5m: number;
    errorRate15m: number;
    clientErrorRate15m: number;
    p50: number;
    p95: number;
    p99: number;
  };
  series: { t: number; requests: number; errors4xx: number; errors5xx: number; p50: number; p95: number }[];
  routes: {
    route: string;
    count: number;
    errors: number;
    clientErrors: number;
    p50: number;
    p95: number;
    max: number;
  }[];
  business: {
    copiesByStatus: Record<string, number>;
    loanItemsByStatus: Record<string, number>;
    overdueItems: number;
    activityLogsWritten: Record<string, number>;
  };
  process: { uptimeSec: number; rssMb: number; heapUsedMb: number; eventLoopP99Ms: number };
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
  userRole?: Role;
}

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
  attributes: Record<string, unknown>;
  events: { name: string; timeMs: number; attributes?: Record<string, unknown> }[];
}

export interface LogEntry {
  id: number;
  time: string;
  level: 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';
  context: string;
  message: string;
  traceId?: string;
  spanId?: string;
  meta?: Record<string, unknown>;
}

export interface TraceDetail {
  summary: TraceSummary | null;
  spans: StoredSpan[];
  logs: LogEntry[];
}
