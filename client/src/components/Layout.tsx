import { useEffect, useState, type ReactNode } from 'react';
import type { Role, StaffUser } from '../features/dashboard/types';

type Theme = 'system' | 'light' | 'dark';

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Library',
    items: [
      { href: '#/dashboard', label: 'Dashboard', roles: ['admin', 'librarian'] },
      { href: '#/activity-logs', label: 'Activity logs', roles: ['admin', 'librarian'] },
    ],
  },
  {
    section: 'Observability',
    items: [
      { href: '#/observability/metrics', label: 'Metrics', roles: ['admin'] },
      { href: '#/observability/traces', label: 'Traces', roles: ['admin'] },
      { href: '#/observability/logs', label: 'Logs', roles: ['admin'] },
    ],
  },
];

function readTheme(): Theme {
  try {
    return (localStorage.getItem('libraflow.theme') as Theme) ?? 'system';
  } catch {
    return 'system';
  }
}

export function Layout({
  path,
  staff,
  actor,
  onActorChange,
  children,
}: {
  path: string;
  staff: StaffUser[];
  actor: StaffUser | null;
  onActorChange: (id: string) => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('libraflow.theme', theme);
    } catch {
      // Theme just won't persist
    }
  }, [theme]);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 16 16">
              <path
                d="M2 2.5h4.5a1.5 1.5 0 0 1 1.5 1.5v10a1 1 0 0 0-1-1H2zM14 2.5H9.5A1.5 1.5 0 0 0 8 4v10a1 1 0 0 1 1-1h5z"
                fill="currentColor"
              />
            </svg>
          </span>
          LibraFlow
        </div>
        {NAV.map(({ section, items }) => {
          const visible = items.filter((item) => actor && item.roles.includes(actor.role));
          if (!visible.length) return null;
          return (
            <div key={section} style={{ display: 'contents' }}>
              <div className="nav-section">{section}</div>
              {visible.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${path.startsWith(item.href.slice(1)) ? 'active' : ''}`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          );
        })}
        <div className="sidebar-foot">
          <label className="card-sub" htmlFor="actor">
            Acting as (dev auth)
          </label>
          <select
            id="actor"
            className="control"
            value={actor?.id ?? ''}
            onChange={(e) => onActorChange(e.target.value)}
          >
            {staff.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.username} · {user.role}
              </option>
            ))}
          </select>
          <select
            className="control"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label="Theme"
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
