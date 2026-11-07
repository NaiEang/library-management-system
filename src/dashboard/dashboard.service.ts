import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withSpan } from '../common/observability/with-span';

type CountRow = { status: string; count: number };

// A loan item is out with the member once it is borrowed or overdue and not yet returned
const ON_LOAN = `returned_at IS NULL AND status IN ('borrowed', 'overdue')`;

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  // Independent queries run in parallel; each gets its own span so the slow one stands out
  async getStats() {
    const [
      catalog,
      members,
      circulation,
      money,
      trend,
      topBooks,
      categoryUsage,
      recentActivity,
    ] = await Promise.all([
      withSpan('dashboard.catalog', () => this.catalog()),
      withSpan('dashboard.members', () => this.members()),
      withSpan('dashboard.circulation', () => this.circulation()),
      withSpan('dashboard.payments', () => this.payments()),
      withSpan('dashboard.loanTrend', () => this.loanTrend()),
      withSpan('dashboard.topBooks', () => this.topBooks()),
      withSpan('dashboard.categoryUsage', () => this.categoryUsage()),
      withSpan('dashboard.recentActivity', () => this.recentActivity()),
    ]);

    const copies = toMap(catalog.copiesByStatus);
    return {
      generatedAt: new Date().toISOString(),
      cards: {
        totalTitles: catalog.titles,
        totalCopies: Object.values(copies).reduce((sum, n) => sum + n, 0),
        availableCopies: copies.available ?? 0,
        onLoan: circulation.onLoan,
        overdue: circulation.overdue,
        dueSoon: circulation.dueSoon,
        pendingRequests: circulation.pendingRequests,
        returnedThisMonth: circulation.returnedThisMonth,
        activeMembers: members.active,
        pendingDepositMembers: members.pendingDeposit,
        blockedMembers: members.blocked,
        totalMembers: members.total,
        depositsHeld: members.depositsHeld,
        finesCollected30d: money.fines,
        depositsCollected30d: money.deposits,
        accruingFines: circulation.accruingFines,
      },
      copiesByStatus: catalog.copiesByStatus,
      loanItemsByStatus: circulation.itemsByStatus,
      loanTrend: trend,
      topBooks,
      categoryUsage,
      recentActivity,
    };
  }

  private async catalog() {
    const [[titles], copiesByStatus] = await Promise.all([
      this.dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM books`,
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT status, COUNT(*)::int AS count FROM book_copies GROUP BY status ORDER BY count DESC`,
      ),
    ]);
    return { titles: titles.count, copiesByStatus };
  }

  private async members() {
    const [row] = await this.dataSource.query<
      {
        total: number;
        active: number;
        pendingDeposit: number;
        blocked: number;
        depositsHeld: number;
      }[]
    >(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE membership_status = 'active' AND expiry_date >= current_date)::int AS active,
        COUNT(*) FILTER (WHERE membership_status = 'pending_deposit')::int AS "pendingDeposit",
        COUNT(*) FILTER (WHERE membership_status = 'blocked')::int AS blocked,
        COALESCE(SUM(deposit_amount) FILTER (WHERE membership_status <> 'expired'), 0)::float AS "depositsHeld"
      FROM members`);
    return row;
  }

  private async circulation() {
    const [itemsByStatus, [counts], [pending]] = await Promise.all([
      // Rejected requests never left the shelf, so they would only inflate "requested"
      this.dataSource.query<CountRow[]>(`
        SELECT li.status, COUNT(*)::int AS count
        FROM loan_items li JOIN loans l ON l.id = li.loan_id
        WHERE l.status <> 'rejected'
        GROUP BY li.status ORDER BY count DESC`),
      this.dataSource.query<
        {
          onLoan: number;
          overdue: number;
          dueSoon: number;
          returnedThisMonth: number;
          accruingFines: number;
        }[]
      >(`
        SELECT
          COUNT(*) FILTER (WHERE ${ON_LOAN})::int AS "onLoan",
          COUNT(*) FILTER (WHERE ${ON_LOAN} AND due_date < now())::int AS overdue,
          COUNT(*) FILTER (WHERE ${ON_LOAN} AND due_date >= now() AND due_date < now() + interval '3 days')::int AS "dueSoon",
          COUNT(*) FILTER (WHERE returned_at >= date_trunc('month', now()))::int AS "returnedThisMonth",
          COALESCE(SUM(fine_amount) FILTER (WHERE ${ON_LOAN} AND due_date < now()), 0)::float AS "accruingFines"
        FROM loan_items`),
      this.dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM loans WHERE status = 'pending'`,
      ),
    ]);
    return { itemsByStatus, ...counts, pendingRequests: pending.count };
  }

  private async payments() {
    const [row] = await this.dataSource.query<
      { fines: number; deposits: number }[]
    >(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE payment_type = 'fine'), 0)::float AS fines,
        COALESCE(SUM(amount) FILTER (WHERE payment_type = 'deposit'), 0)::float AS deposits
      FROM payments
      WHERE status = 'completed' AND payment_date >= now() - interval '30 days'`);
    return row;
  }

  private loanTrend() {
    return this.dataSource.query<
      { date: string; requested: number; borrowed: number; returned: number }[]
    >(`
      SELECT to_char(day, 'YYYY-MM-DD') AS date,
        (SELECT COUNT(*) FROM loans WHERE loan_date::date = day)::int AS requested,
        (SELECT COUNT(*) FROM loan_items WHERE borrowed_at::date = day AND status <> 'requested')::int AS borrowed,
        (SELECT COUNT(*) FROM loan_items WHERE returned_at::date = day)::int AS returned
      FROM generate_series(current_date - 29, current_date, interval '1 day') AS day
      ORDER BY day`);
  }

  private topBooks() {
    return this.dataSource.query<
      { bookId: string; title: string; authors: string; loanCount: number }[]
    >(`
      SELECT b.id AS "bookId", b.title,
        COALESCE((SELECT string_agg(a.name, ', ' ORDER BY a.name)
                  FROM book_authors ba JOIN authors a ON a.id = ba.author_id
                  WHERE ba.book_id = b.id), '') AS authors,
        COUNT(*)::int AS "loanCount"
      FROM loan_items li
      JOIN book_copies c ON c.id = li.book_copy_id
      JOIN books b ON b.id = c.book_id
      WHERE li.borrowed_at >= now() - interval '90 days' AND li.status <> 'requested'
      GROUP BY b.id
      ORDER BY "loanCount" DESC, b.title
      LIMIT 5`);
  }

  private categoryUsage() {
    return this.dataSource.query<{ category: string; loanCount: number }[]>(`
      SELECT COALESCE(cat.name, 'Uncategorized') AS category, COUNT(*)::int AS "loanCount"
      FROM loan_items li
      JOIN book_copies c ON c.id = li.book_copy_id
      JOIN books b ON b.id = c.book_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE li.borrowed_at >= now() - interval '30 days' AND li.status <> 'requested'
      GROUP BY 1
      ORDER BY "loanCount" DESC, category`);
  }

  private recentActivity() {
    return this.dataSource.query<
      {
        id: string;
        action: string;
        entityType: string;
        description: string;
        createdAt: string;
        username: string;
        role: string;
      }[]
    >(`
      SELECT l.id, l.action, l.entity_type AS "entityType", l.description, l.created_at AS "createdAt",
        u.username, r.name AS role
      FROM activity_logs l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 8`);
  }
}

function toMap(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}
