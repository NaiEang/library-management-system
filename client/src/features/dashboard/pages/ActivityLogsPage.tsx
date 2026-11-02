import { useEffect, useMemo, useState } from 'react';
import { Card, ErrorBox, PageHead, RoleBadge } from '../components/ui';
import { useApi } from '../api';
import { formatDateTime, formatNumber, formatRelative, humanize } from '../format';
import type { ActivityFacets, ActivityLogRow, Paged } from '../types';

const RANGES = [
  { value: 'all', label: 'All time', days: 0 },
  { value: '1', label: 'Today', days: 1 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
];

export function ActivityLogsPage() {
  const [range, setRange] = useState('all');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => setPage(1), [range, action, entityType, actorRole, search]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    const days = RANGES.find((r) => r.value === range)?.days;
    if (days) {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - (days - 1));
      params.set('from', from.toISOString());
    }
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    if (actorRole) params.set('role', actorRole);
    if (search) params.set('search', search);
    return `/activity-logs?${params}`;
  }, [page, range, action, entityType, actorRole, search]);

  const { data, error, refreshing } = useApi<Paged<ActivityLogRow>>(path, 15_000);
  const { data: facets } = useApi<ActivityFacets>('/activity-logs/facets');

  return (
    <>
      <PageHead
        title="Activity logs"
        sub="Every write by an admin or librarian, recorded automatically by ActivityLogInterceptor"
      />
      <div className="filters">
        <select className="control" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="control" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
          <option value="">All actions</option>
          {facets?.actions.map((a) => (
            <option key={a.value} value={a.value}>
              {humanize(a.value)} ({formatNumber(a.count)})
            </option>
          ))}
        </select>
        <select
          className="control"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          aria-label="Entity"
        >
          <option value="">All entities</option>
          {facets?.entityTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value} ({formatNumber(t.count)})
            </option>
          ))}
        </select>
        <select
          className="control"
          value={actorRole}
          onChange={(e) => setActorRole(e.target.value)}
          aria-label="Staff role"
        >
          <option value="">Any staff</option>
          <option value="admin">Admins</option>
          <option value="librarian">Librarians</option>
        </select>
        <input
          className="control"
          type="search"
          placeholder="Search description or username…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
      <ErrorBox error={error} />

      <Card title={data ? `${formatNumber(data.meta.total)} entries` : 'Loading…'} sub="Newest first">
        <div className={`table-wrap ${refreshing ? 'refetching' : ''}`}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Staff</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
                <th className="num">IP</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((log) => (
                <tr key={log.id}>
                  <td className="nowrap" title={new Date(log.createdAt).toLocaleString()}>
                    {formatDateTime(log.createdAt)}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatRelative(log.createdAt)}
                    </div>
                  </td>
                  <td className="nowrap">
                    {log.user ? (
                      <>
                        {log.user.name || log.user.username}
                        <div>
                          <RoleBadge role={log.user.role} />
                        </div>
                      </>
                    ) : (
                      <span className="muted">Deleted user</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{humanize(log.action)}</span>
                  </td>
                  <td className="nowrap mono">
                    {log.entityType}
                    {log.entityId && <span className="muted"> #{log.entityId}</span>}
                  </td>
                  <td className="secondary">
                    <div className="ellipsis">{log.description ?? '—'}</div>
                  </td>
                  <td className="num mono muted nowrap">{log.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.data.length && <div className="empty">No activity matches these filters</div>}
        </div>
        {data && data.meta.totalPages > 1 && (
          <div className="pager">
            <span>
              Page {data.meta.page} of {formatNumber(data.meta.totalPages)}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ← Newer
              </button>
              <button className="btn" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
                Older →
              </button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
