import type { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';

type Answer = [pattern: RegExp, rows: unknown[]];

/** Answers each raw query by matching its SQL, and fails on any query it does not know. */
function fakeDataSource(answers: Answer[]) {
  const query = vi.fn((sql: string) => {
    const answer = answers.find(([pattern]) => pattern.test(sql));
    return answer
      ? Promise.resolve(answer[1])
      : Promise.reject(new Error(`Unexpected query: ${sql}`));
  });
  return { dataSource: { query } as unknown as DataSource, query };
}

const loanItemsByStatus = [
  { status: 'returned', count: 6 },
  { status: 'borrowed', count: 3 },
];
const loanTrend = [
  { date: '2026-11-09', requested: 2, borrowed: 1, returned: 0 },
  { date: '2026-11-10', requested: 1, borrowed: 2, returned: 1 },
];
const topBooks = [
  {
    bookId: '1',
    title: 'Clean Code',
    authors: 'Robert C. Martin',
    loanCount: 4,
  },
];
const categoryUsage = [{ category: 'Software', loanCount: 4 }];
const recentActivity = [
  {
    id: '9',
    action: 'APPROVE',
    entityType: 'Loan',
    description: 'desk.librarian approved Loan #3',
    createdAt: '2026-11-10T08:00:00.000Z',
    username: 'desk.librarian',
    role: 'librarian',
  },
];

function answers(copiesByStatus: unknown[]): Answer[] {
  return [
    [/FROM books\b/, [{ count: 5 }]],
    [/FROM book_copies GROUP BY status/, copiesByStatus],
    [
      /FROM members/,
      [
        {
          total: 4,
          active: 2,
          pendingDeposit: 1,
          blocked: 1,
          depositsHeld: 15,
        },
      ],
    ],
    [/JOIN loans l ON l.id = li.loan_id/, loanItemsByStatus],
    [
      /AS "onLoan"/,
      [
        {
          onLoan: 3,
          overdue: 1,
          dueSoon: 1,
          returnedThisMonth: 2,
          accruingFines: 1.5,
        },
      ],
    ],
    [/FROM loans WHERE status = 'pending'/, [{ count: 2 }]],
    [/FROM payments/, [{ fines: 2.5, deposits: 10 }]],
    [/generate_series/, loanTrend],
    [/AS "bookId"/, topBooks],
    [/'Uncategorized'/, categoryUsage],
    [/FROM activity_logs/, recentActivity],
  ];
}

describe('DashboardService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:30:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('builds the stat cards and passes the chart series through', async () => {
    const copiesByStatus = [
      { status: 'available', count: 7 },
      { status: 'borrowed', count: 3 },
      { status: 'lost', count: 1 },
    ];
    const { dataSource, query } = fakeDataSource(answers(copiesByStatus));

    const stats = await new DashboardService(dataSource).getStats();

    expect(stats).toEqual({
      generatedAt: '2026-11-10T09:30:00.000Z',
      cards: {
        totalTitles: 5,
        totalCopies: 11,
        availableCopies: 7,
        onLoan: 3,
        overdue: 1,
        dueSoon: 1,
        pendingRequests: 2,
        returnedThisMonth: 2,
        activeMembers: 2,
        pendingDepositMembers: 1,
        blockedMembers: 1,
        totalMembers: 4,
        depositsHeld: 15,
        finesCollected30d: 2.5,
        depositsCollected30d: 10,
        accruingFines: 1.5,
      },
      copiesByStatus,
      loanItemsByStatus,
      loanTrend,
      topBooks,
      categoryUsage,
      recentActivity,
    });
    // One query per number, none repeated
    expect(query).toHaveBeenCalledTimes(11);
  });

  it('shows 0 available copies when none are on the shelf', async () => {
    const { dataSource } = fakeDataSource(
      answers([{ status: 'borrowed', count: 2 }]),
    );
    const { cards } = await new DashboardService(dataSource).getStats();
    expect(cards).toMatchObject({ totalCopies: 2, availableCopies: 0 });
  });

  it('copes with an empty catalogue', async () => {
    const { dataSource } = fakeDataSource(answers([]));
    const { cards } = await new DashboardService(dataSource).getStats();
    expect(cards).toMatchObject({ totalCopies: 0, availableCopies: 0 });
  });

  it('fails as a whole when one query fails, rather than showing partial numbers', async () => {
    const broken = answers([]).filter(
      ([pattern]) => !pattern.test('FROM payments'),
    );
    const { dataSource } = fakeDataSource(broken);
    await expect(new DashboardService(dataSource).getStats()).rejects.toThrow(
      /Unexpected query/,
    );
  });
});
