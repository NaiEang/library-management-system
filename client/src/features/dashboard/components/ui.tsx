import type { ReactNode } from 'react';
import type { ApiError } from '../api';
import type { Role } from '../types';

export type StatusKind = 'good' | 'warning' | 'serious' | 'critical';

/** Status always ships as icon + label, never color alone. */
export function StatusIcon({ kind, size = 14 }: { kind: StatusKind; size?: number }) {
  const color = `var(--${kind})`;
  if (kind === 'good') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill={color} />
        <path
          d="M4.8 8.2 7 10.3l4.2-4.6"
          stroke="#fff"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'critical') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1z" fill={color} />
        <path d="M8 4.5v4.2M8 11.1v.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.2 15.2 14H.8z" fill={color} strokeLinejoin="round" />
      <path
        d="M8 6v3.6M8 11.6v.3"
        stroke={kind === 'warning' ? '#0b0b0b' : '#fff'}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className="status">
      <StatusIcon kind={kind} />
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  foot,
  status,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  status?: { kind: StatusKind; label: string };
}) {
  return (
    <div className="card">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {(foot || status) && (
        <div className="tile-foot">
          {status && <Status kind={status.kind}>{status.label}</Status>}
          {foot}
        </div>
      )}
    </div>
  );
}

export function Card({
  title,
  sub,
  action,
  children,
  className,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ''}`}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className="badge">{role.charAt(0).toUpperCase() + role.slice(1)}</span>;
}

export function HttpStatus({ code }: { code?: number }) {
  if (!code) return <span className="muted">—</span>;
  if (code >= 500) return <Status kind="critical">{code}</Status>;
  if (code >= 400) return <Status kind="warning">{code}</Status>;
  return <Status kind="good">{code}</Status>;
}

export function ErrorBox({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="error-box">
      <Status kind="critical">
        {error.status === 403 ? 'Not allowed for this role' : `Request failed (${error.status || 'network'})`}
      </Status>
      <div className="secondary" style={{ marginTop: 4 }}>
        {error.message}
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}
