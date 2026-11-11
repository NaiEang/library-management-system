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
} = {}) {
  // Each repository is "bound" to the transaction by returning itself
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
    save: vi.fn((loan: object) => Promise.resolve({ id: '50', ...loan })),
  };
  const loanItems = { createQueryBuilder: () => qb, create, save: vi.fn((rows: unknown) => Promise.resolve(rows)) };
  const bookCopies = {
    find: vi.fn(() => Promise.resolve(copies)),
    save: vi.fn((rows: unknown) => Promise.resolve(rows)),
  };
  const members = { findOne: vi.fn(() => Promise.resolve(memberRow)) };
  const service = new LoansService(
    loans as unknown as Repository<Loan>,
    loanItems as unknown as Repository<LoanItem>,
    bookCopies as unknown as Repository<BookCopy>,
    members as unknown as Repository<Member>,
  );
  return { service, qb, loans, loanItems, bookCopies };
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
