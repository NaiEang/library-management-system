import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../api';
import { Card, ErrorBox, PageHead, Status } from '../components/ui';
import { formatTime } from '../format';
import type { LogEntry } from '../types';

const LEVELS = ['error', 'warn', 'log', 'debug'] as const;

function Level({ level }: { level: LogEntry['level'] }) {
  if (level === 'error' || level === 'fatal') return <Status kind="critical">{level}</Status>;
  if (level === 'warn') return <Status kind="warning">warn</Status>;
  return <span className="muted mono">{level}</span>;
}

export function LogsPage() {
  const [levels, setLevels] = useState<string[]>(['error', 'warn', 'log']);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const path = useMemo(() => {
    const params = new URLSearchParams({ limit: '300' });
    if (levels.length) params.set('level', levels.join(','));
    if (search) params.set('search', search);
    return `/observability/logs?${params}`;
  }, [levels, search]);
  const { data, error } = useApi<LogEntry[]>(path, live ? 3_000 : undefined);

  const toggle = (level: string) =>
    setLevels((current) => (current.includes(level) ? current.filter((l) => l !== level) : [...current, level]));

  return (
    <>
      <PageHead
        title="Logs"
        sub="Structured JSON logs (also in LOG_FILE, logs/app.log by default) stamped with trace and span ids"
      />
      <div className="filters">
        {LEVELS.map((level) => (
          <button key={level} className="chip" aria-pressed={levels.includes(level)} onClick={() => toggle(level)}>
            {level}
          </button>
        ))}
        <input
          className="control"
          type="search"
          placeholder="Search message or context…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live tail
        </label>
      </div>
      <ErrorBox error={error} />
      <Card
        title={data ? `${data.length} lines` : 'Loading…'}
        sub="Newest first · click a trace id to open its waterfall"
      >
        <div style={{ margin: '0 -18px -16px' }}>
          {data?.map((log) => (
            <div key={log.id} className="log-line">
              <span className="muted mono">{formatTime(log.time)}</span>
              <Level level={log.level} />
              <span className="muted mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {log.context}
              </span>
              <span style={{ wordBreak: 'break-word' }}>{log.message}</span>
              {log.traceId ? (
                <a className="mono" href={`#/observability/traces/${log.traceId}`}>
                  {log.traceId.slice(0, 8)}
                </a>
              ) : (
                <span />
              )}
            </div>
          ))}
          {data && !data.length && <div className="empty">No log lines match</div>}
        </div>
      </Card>
    </>
  );
}
