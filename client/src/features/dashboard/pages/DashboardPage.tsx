import { BarList, LineChart } from '../components/charts';
import { Card, ErrorBox, PageHead, RoleBadge, StatTile } from '../components/ui';
import { useApi } from '../api';
import { formatMoney, formatNumber, formatRelative, formatTime, humanize } from '../format';
import type { DashboardStats, Role } from '../types';

const TREND_SERIES = [
  { key: 'requested', label: 'Requested', color: 'var(--series-1)' },
  { key: 'borrowed', label: 'Borrowed', color: 'var(--series-2)' },
  { key: 'returned', label: 'Returned', color: 'var(--series-3)' },
];

const formatDay = (value: string | number) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function DashboardPage({ role }: { role: Role }) {
  const { data, error, refreshing } = useApi<DashboardStats>('/dashboard/stats', 30_000);
  const cards = data?.cards;

  return (
    <>
      <PageHead
        title={role === 'admin' ? 'Admin dashboard' : 'Librarian dashboard'}
        sub={data ? `GET /dashboard/stats · updated ${formatTime(data.generatedAt)} · refreshes every 30s` : 'Loading…'}
      />
      <ErrorBox error={error} />
      {cards && data && (
        <div className={`stack ${refreshing ? 'refetching' : ''}`}>
          <div className="grid tiles">
            <StatTile
              label="On loan"
              value={formatNumber(cards.onLoan)}
              foot={`${formatNumber(cards.returnedThisMonth)} returned this month`}
            />
            <StatTile
              label="Overdue"
              value={formatNumber(cards.overdue)}
              status={
                cards.overdue > 0
                  ? { kind: 'critical', label: 'Needs follow-up' }
                  : { kind: 'good', label: 'All on time' }
              }
            />
            <StatTile label="Due in 3 days" value={formatNumber(cards.dueSoon)} foot="Reminder candidates" />
            <StatTile
              label="Pending requests"
              value={formatNumber(cards.pendingRequests)}
              status={cards.pendingRequests > 10 ? { kind: 'warning', label: 'Backlog building' } : undefined}
              foot={cards.pendingRequests <= 10 ? 'Awaiting approval' : undefined}
            />
            <StatTile
              label="Available copies"
              value={formatNumber(cards.availableCopies)}
              foot={`of ${formatNumber(cards.totalCopies)} copies · ${formatNumber(cards.totalTitles)} titles`}
            />
            <StatTile
              label="Active members"
              value={formatNumber(cards.activeMembers)}
              foot={`${cards.pendingDepositMembers} awaiting deposit · ${cards.blockedMembers} blocked`}
            />
            {role === 'admin' && (
              <>
                <StatTile
                  label="Deposits held"
                  value={formatMoney(cards.depositsHeld)}
                  foot={`${formatMoney(cards.depositsCollected30d)} collected in 30 days`}
                />
                <StatTile
                  label="Fines collected"
                  value={formatMoney(cards.finesCollected30d)}
                  foot={`Last 30 days · ${formatMoney(cards.accruingFines)} accruing on overdue items`}
                />
              </>
            )}
          </div>

          <Card title="Loan activity" sub="Last 30 days, per day">
            <LineChart
              data={data.loanTrend}
              xKey="date"
              series={TREND_SERIES}
              formatX={formatDay}
              ariaLabel="Daily loan requests, borrowed items and returns over the last 30 days"
            />
          </Card>

          <div className="grid three">
            <Card title="Copies by status" sub={`${formatNumber(cards.totalCopies)} physical copies`}>
              <BarList
                rows={data.copiesByStatus.map((row) => ({
                  key: row.status,
                  label: humanize(row.status),
                  value: row.count,
                }))}
              />
            </Card>
            <Card title="Most borrowed" sub="Last 90 days">
              <BarList
                rows={data.topBooks.map((book) => ({
                  key: book.bookId,
                  label: book.title,
                  value: book.loanCount,
                  title: `${book.title}${book.authors ? ` by ${book.authors}` : ''}: ${book.loanCount} loans`,
                }))}
              />
            </Card>
            <Card title="Loans by category" sub="Last 30 days">
              <BarList
                rows={data.categoryUsage.map((row) => ({
                  key: row.category,
                  label: row.category,
                  value: row.loanCount,
                }))}
              />
            </Card>
          </div>

          <Card title="Recent staff activity" action={<a href="#/activity-logs">View all logs →</a>}>
            <div className="table-wrap">
              <table>
                <tbody>
                  {data.recentActivity.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="badge">{humanize(entry.action)}</span>
                      </td>
                      <td className="secondary">
                        <div className="ellipsis">{entry.description ?? entry.entityType}</div>
                      </td>
                      <td className="nowrap">{entry.role && <RoleBadge role={entry.role} />}</td>
                      <td className="num muted nowrap" title={new Date(entry.createdAt).toLocaleString()}>
                        {formatRelative(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.recentActivity.length && <div className="empty">No staff activity yet</div>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
