import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { useApi } from './features/dashboard/api';
import { ErrorBox } from './features/dashboard/components/ui';
import { ActivityLogsPage } from './features/dashboard/pages/ActivityLogsPage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { LogsPage } from './features/dashboard/pages/LogsPage';
import { MetricsPage } from './features/dashboard/pages/MetricsPage';
import { TraceDetailPage } from './features/dashboard/pages/TraceDetailPage';
import { TracesPage } from './features/dashboard/pages/TracesPage';
import type { StaffUser } from './features/dashboard/types';
import { setDevUser } from './lib/api';

/** Minimal hash router: `#/observability/traces/abc` → ['observability', 'traces', 'abc']. */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const [segments, setSegments] = useState(read);
  useEffect(() => {
    const onChange = () => setSegments(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return segments;
}

export function useQueryParam(name: string): string | null {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(name);
  const [value, setValue] = useState(read);
  useEffect(() => {
    const onChange = () => setValue(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [name]);
  return value;
}

const ACTOR_KEY = 'libraflow.devUser';

function readActor() {
  try {
    return localStorage.getItem(ACTOR_KEY);
  } catch {
    return null;
  }
}

// Swap the dev "acting as" picker for Sothcheat's ProtectedRoute + login once JWT lands
export function AppRouter() {
  const segments = useRoute();
  const { data: staff, error } = useApi<StaffUser[]>('/dev/users');
  const [actorId, setActorId] = useState<string | null>(readActor);
  const actor = staff?.find((user) => user.id === actorId) ?? staff?.find((user) => user.role === 'admin') ?? null;

  if (actor) setDevUser(actor.id);

  const changeActor = (id: string) => {
    setActorId(id);
    setDevUser(id);
    try {
      localStorage.setItem(ACTOR_KEY, id);
    } catch {
      // Selection just won't persist
    }
  };

  const path = segments.join('/') || 'dashboard';
  let page;
  if (!actor) page = error ? <ErrorBox error={error} /> : <div className="empty">Connecting to the API…</div>;
  else if (segments[0] === 'activity-logs') page = <ActivityLogsPage key={actor.id} />;
  else if (segments[0] === 'observability' && segments[1] === 'metrics') page = <MetricsPage key={actor.id} />;
  else if (segments[0] === 'observability' && segments[1] === 'traces' && segments[2])
    page = <TraceDetailPage key={segments[2]} traceId={segments[2]} />;
  else if (segments[0] === 'observability' && segments[1] === 'traces') page = <TracesPage key={actor.id} />;
  else if (segments[0] === 'observability' && segments[1] === 'logs') page = <LogsPage key={actor.id} />;
  else page = <DashboardPage key={actor.id} role={actor.role} />;

  return (
    <Layout path={path} staff={staff ?? []} actor={actor} onActorChange={changeActor}>
      {page}
    </Layout>
  );
}
