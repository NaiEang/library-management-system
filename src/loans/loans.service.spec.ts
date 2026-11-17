import type { Repository } from 'typeorm';
import type { BookCopy } from '../books/entities/book-copy.entity';
import type { Member } from '../members/entities/member.entity';
import type { LoanItem } from './entities/loan-item.entity';
import type { Loan } from './entities/loan.entity';
import { LoansService } from './loans.service';

const member = { id: '1', depositAmount: '5.00', blockedUntil: null };

function setup({
  memberRow = member as unknown,
  overdueCount = 0,
  copies = [{ id: '10', status: 'available' }] as Array<{ id: string; status: string }>,
  existingLoan = null as unknown,
} = {}) {
  const manager = {
    transaction: (work: (m: unknown) => unknown) => work(manager),
    withRepository: <T>(repo: T) => repo,
  };
  const qb = {
    innerJoin: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    getCount: vi.fn(() => Promise.resolve(overdueCount)),
  };
  const create = <T>(row: T) => row;
  const loans = {
    manager,
    create,
    findOne: vi.fn(() => Promise.resolve(existingLoan)),
    findAndCount: vi.fn(() => Promise.resolve([existingLoan ? [existingLoan] : [], existingLoan ? 1 : 0])),
    save: vi.fn((loan: object) => Promise.resolve({ id: '50', ...loan })),
  };
  const loanItems = { createQueryBuilder: () => qb, create, save: vi.fn((rows: unknown) => Promise.resolve(rows)) };
  const bookCopies = {
    find: vi.fn(() => Promise.resolve(copies)),
    save: vi.fn((rows: unknown) => Promise.resolve(rows)),
  };
  const members = {
    findOne: vi.fn(() => Promise.resolve(memberRow)),
    save: vi.fn((row: unknown) => Promise.resolve(row)),
  };
  const service = new LoansService(
    loans as unknown as Repository<Loan>,
    loanItems as unknown as Repository<LoanItem>,
    bookCopies as unknown as Repository<BookCopy>,
    members as unknown as Repository<Member>,
  );
  return { service, qb, loans, loanItems, bookCopies, members };
}

describe('LoansService.requestLoan', () => {
  it('creates a pending loan, reserves the copies and stores items as requested', async () => {
    const { service, loanItems, bookCopies } = setup();
    const loan = await service.requestLoan('1', ['10']);

    expect(loan).toMatchObject({ id: '50', memberId: '1', status: 'pending' });
    expect(bookCopies.save).toHaveBeenCalledWith([{ id: '10', status: 'reserved' }]);
    expect(loanItems.save).toHaveBeenCalledWith([
      { loanId: '50', bookCopyId: '10', status: 'requested' },
    ]);
  });

  it('counts unreturned borrowed or overdue items past their due date', async () => {
    const { service, qb } = setup();
    await service.requestLoan('1', ['10']);
    expect(qb.andWhere).toHaveBeenCalledWith('item.returned_at IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('item.status IN (:...statuses)', {
      statuses: ['borrowed', 'overdue'],
    });
  });

  it.each([
    ['the member has overdue books', { overdueCount: 1 }, /overdue books/],
    [
      'a late-return penalty is still running',
      { memberRow: { ...member, blockedUntil: new Date(Date.now() + 86_400_000) } },
      /penalty/,
    ],
    ['the deposit is missing', { memberRow: { ...member, depositAmount: '0' } }, /deposit/],
    ['a copy is not available', { copies: [{ id: '10', status: 'borrowed' }] }, /Copy 10 is borrowed/],
  ])('refuses when %s', async (_case, options, message) => {
    const { service, loans } = setup(options);
    await expect(service.requestLoan('1', ['10'])).rejects.toThrow(message);
    expect(loans.save).not.toHaveBeenCalled();
  });

  it('allows a member whose penalty has ended', async () => {
    const { service } = setup({
      memberRow: { ...member, blockedUntil: new Date(Date.now() - 1000) },
    });
    await expect(service.requestLoan('1', ['10'])).resolves.toBeDefined();
  });
});

const pendingLoan = {
  id: '50',
  memberId: '1',
  loanCode: 'LN-123',
  status: 'pending',
  loanItems: [
    { id: '1', status: 'requested', bookCopy: { id: '10', status: 'reserved' } },
    { id: '2', status: 'requested', bookCopy: { id: '11', status: 'reserved' } },
  ],
};

const activeLoan = {
  id: '50',
  memberId: '1',
  loanCode: 'LN-123',
  status: 'active',
  loanItems: [
    { id: '1', status: 'borrowed', borrowedAt: new Date(), dueDate: new Date(), bookCopy: { id: '10', status: 'borrowed' } },
  ],
};

describe('LoansService.rejectLoan', () => {
  it('sets the loan to rejected and releases copies back to available', async () => {
    const { service, bookCopies } = setup({ existingLoan: pendingLoan });
    const result = await service.rejectLoan('50');

    expect(result).toMatchObject({ id: '50', status: 'rejected' });
    expect(bookCopies.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: '10', status: 'available' }),
        expect.objectContaining({ id: '11', status: 'available' }),
      ]),
    );
  });

  it('refuses when the loan is not pending', async () => {
    const { service, loans } = setup({ existingLoan: activeLoan });
    await expect(service.rejectLoan('50')).rejects.toThrow(/pending/i);
    expect(loans.save).not.toHaveBeenCalled();
  });

  it('refuses when the loan does not exist', async () => {
    const { service, loans } = setup({ existingLoan: null });
    await expect(service.rejectLoan('999')).rejects.toThrow(/pending/i);
    expect(loans.save).not.toHaveBeenCalled();
  });
});

describe('LoansService.findByMember', () => {
  it('returns paginated loans for the member', async () => {
    const loan = { ...activeLoan, createdAt: new Date() };
    const { service, loans } = setup({ existingLoan: loan });
    const result = await service.findByMember('1', { page: 1, limit: 20 });

    expect(result).toEqual({
      data: [loan],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(loans.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: '1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filters by status when provided', async () => {
    const { service, loans } = setup({ existingLoan: null });
    await service.findByMember('1', { page: 1, limit: 10, status: 'active' as never });

    expect(loans.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: '1', status: 'active' },
      }),
    );
  });

  it('applies pagination offset correctly', async () => {
    const { service, loans } = setup({ existingLoan: null });
    await service.findByMember('1', { page: 3, limit: 10 });

    expect(loans.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe('LoansService.returnLoan', () => {
  const DAY_MS = 24 * 3600 * 1000;

  function returnSetup({
    memberRow = { id: '1', depositAmount: '10.00', blockedUntil: null } as unknown,
    loanItems = [] as Array<{
      id: string;
      status: string;
      dueDate: Date | null;
      returnedAt: Date | null;
      fineAmount: number;
      bookCopy: { id: string; status: string };
    }>,
    loanStatus = 'active',
  } = {}) {
    const loan = {
      id: '50',
      memberId: '1',
      status: loanStatus,
      loanItems,
    };
    const manager = {
      transaction: (work: (m: unknown) => unknown) => work(manager),
      withRepository: <T>(repo: T) => repo,
    };
    const loans = {
      manager,
      findOne: vi.fn(() => Promise.resolve(loan)),
      save: vi.fn((l: object) => Promise.resolve(l)),
    };
    const loanItemsRepo = {
      save: vi.fn((rows: unknown) => Promise.resolve(rows)),
    };
    const bookCopies = {
      save: vi.fn((rows: unknown) => Promise.resolve(rows)),
    };
    const members = {
      findOne: vi.fn(() => Promise.resolve(memberRow)),
      save: vi.fn((row: unknown) => Promise.resolve(row)),
    };
    const service = new LoansService(
      loans as unknown as Repository<Loan>,
      loanItemsRepo as unknown as Repository<LoanItem>,
      bookCopies as unknown as Repository<BookCopy>,
      members as unknown as Repository<Member>,
    );
    return { service, loan, members };
  }

  it('returns items without fine when not overdue', async () => {
    const dueDate = new Date(Date.now() + 3 * DAY_MS);
    const { service, members } = returnSetup({
      loanItems: [
        { id: '1', status: 'borrowed', dueDate, returnedAt: null, fineAmount: 0, bookCopy: { id: '10', status: 'borrowed' } },
      ],
    });
    const result = await service.returnLoan('50');
    expect(result.status).toBe('completed');
    expect(result.totalFine).toBe(0);
    expect(result.blockedUntil).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].overdueDays).toBe(0);
    expect(result.items[0].fineAmount).toBe(0);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('calculates fine and deducts from deposit for overdue items', async () => {
    const dueDate = new Date(Date.now() - 5.5 * DAY_MS);
    const memberRow = { id: '1', depositAmount: '10.00', blockedUntil: null };
    const items = [
      { id: '1', status: 'overdue', dueDate, returnedAt: null, fineAmount: 0, bookCopy: { id: '10', status: 'borrowed' } },
    ];
    const { service, members } = returnSetup({ memberRow, loanItems: items });

    const result = await service.returnLoan('50');

    expect(items[0].fineAmount).toBe(1.5);
    expect(items[0].status).toBe('returned');
    expect(result.totalFine).toBe(1.5);
    expect(result.blockedUntil).toBeInstanceOf(Date);
    expect(result.items[0].overdueDays).toBe(6);
    expect(members.save).toHaveBeenCalled();
    const savedMember = (members.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedMember.depositAmount).toBe(8.5);
  });

  it('clamps deposit at zero when fine exceeds balance', async () => {
    const dueDate = new Date(Date.now() - 50.5 * DAY_MS);
    const memberRow = { id: '1', depositAmount: '5.00', blockedUntil: null };
    const items = [
      { id: '1', status: 'overdue', dueDate, returnedAt: null, fineAmount: 0, bookCopy: { id: '10', status: 'borrowed' } },
    ];
    const { service, members } = returnSetup({ memberRow, loanItems: items });

    await service.returnLoan('50');

    const savedMember = (members.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedMember.depositAmount).toBe(0);
  });

  it('sets blockedUntil to 2× overdue days from now', async () => {
    const dueDate = new Date(Date.now() - 5.5 * DAY_MS);
    const memberRow = { id: '1', depositAmount: '10.00', blockedUntil: null };
    const items = [
      { id: '1', status: 'overdue', dueDate, returnedAt: null, fineAmount: 0, bookCopy: { id: '10', status: 'borrowed' } },
    ];
    const { service, members } = returnSetup({ memberRow, loanItems: items });

    await service.returnLoan('50');

    const savedMember = (members.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const blockDays = (savedMember.blockedUntil.getTime() - Date.now()) / DAY_MS;
    expect(blockDays).toBeGreaterThan(11);
    expect(blockDays).toBeLessThan(13);
  });

  it('uses the max overdue days across multiple items for blockedUntil', async () => {
    const memberRow = { id: '1', depositAmount: '20.00', blockedUntil: null };
    const items = [
      { id: '1', status: 'overdue', dueDate: new Date(Date.now() - 3.5 * DAY_MS), returnedAt: null, fineAmount: 0, bookCopy: { id: '10', status: 'borrowed' } },
      { id: '2', status: 'overdue', dueDate: new Date(Date.now() - 7.5 * DAY_MS), returnedAt: null, fineAmount: 0, bookCopy: { id: '11', status: 'borrowed' } },
    ];
    const { service, members } = returnSetup({ memberRow, loanItems: items });

    await service.returnLoan('50');

    const savedMember = (members.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedMember.depositAmount).toBe(17);
    expect(savedMember.blockedUntil).toBeInstanceOf(Date);
    const blockDays = (savedMember.blockedUntil.getTime() - Date.now()) / DAY_MS;
    expect(blockDays).toBeGreaterThan(15);
    expect(blockDays).toBeLessThan(17);
  });
});
