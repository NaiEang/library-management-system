import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BookCopy } from '../books/entities/book-copy.entity';
import { CopyStatus, LoanItemStatus, LoanStatus } from '../common/constants';
import { Member } from '../members/entities/member.entity';
import { LoanItem } from './entities/loan-item.entity';
import { Loan } from './entities/loan.entity';
import type { MyLoansQueryDto } from './dto/my-loans-query.dto';

const BORROW_PERIOD_DAYS = 14;
const REQUIRED_DEPOSIT = 5;
const FINE_PER_DAY = 0.25;
const BLOCK_MULTIPLIER = 2;
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(LoanItem)
    private readonly loanItemRepository: Repository<LoanItem>,
    @InjectRepository(BookCopy)
    private readonly bookCopyRepository: Repository<BookCopy>,
    @InjectRepository(Member)
    private readonly memberRepository: Repository<Member>,
  ) {}

  async findByMember(
    memberId: string,
    query: MyLoansQueryDto,
  ): Promise<{ data: Loan[]; total: number; page: number; limit: number }> {
    const where: Record<string, unknown> = { memberId };
    if (query.status) where.status = query.status;

    const [data, total] = await this.loanRepository.findAndCount({
      where,
      relations: { loanItems: { bookCopy: { book: true } } },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    return { data, total, page: query.page, limit: query.limit };
  }

  async requestLoan(memberId: string, bookCopyIds: string[]): Promise<Loan> {
    return this.inTransaction(async (repos) => {
      const member = await repos.members.findOne({ where: { id: memberId } });
      if (!member) throw new NotFoundException('Member not found');

      if (Number(member.depositAmount) < REQUIRED_DEPOSIT) {
        throw new BadRequestException(
          `Insufficient deposit. A minimum balance of $${REQUIRED_DEPOSIT} is required to borrow.`,
        );
      }

      // Late Block Rule: a late-return penalty still running, or any
      // unreturned item past its due date (marked overdue yet or not)
      const now = new Date();
      if (member.blockedUntil && member.blockedUntil > now) {
        throw new BadRequestException('Account blocked: late-return penalty is still active.');
      }
      if ((await this.countOverdueItems(repos.loanItems, memberId, now)) > 0) {
        throw new BadRequestException('Account blocked: You have overdue books.');
      }

      // Locked so two requests can't reserve the same copy at once
      const copies = await repos.bookCopies.find({
        where: { id: In(bookCopyIds) },
        lock: { mode: 'pessimistic_write' },
      });
      if (copies.length !== new Set(bookCopyIds).size) {
        throw new NotFoundException('One or more book copies not found.');
      }
      const unavailable = copies.find((copy) => copy.status !== CopyStatus.AVAILABLE);
      if (unavailable) {
        throw new BadRequestException(`Copy ${unavailable.id} is ${unavailable.status}.`);
      }

      const loan = await repos.loans.save(
        repos.loans.create({
          memberId,
          loanDate: now,
          status: LoanStatus.PENDING,
          loanCode: `LN-${Date.now()}`,
        }),
      );

      for (const copy of copies) copy.status = CopyStatus.RESERVED;
      await repos.bookCopies.save(copies);
      await repos.loanItems.save(
        copies.map((copy) =>
          repos.loanItems.create({
            loanId: loan.id,
            bookCopyId: copy.id,
            status: LoanItemStatus.REQUESTED,
          }),
        ),
      );

      return loan;
    });
  }

  async approveLoan(loanId: string): Promise<Loan> {
    return this.inTransaction(async (repos) => {
      const loan = await this.findLoanWithItems(repos.loans, loanId);
      if (!loan || loan.status !== LoanStatus.PENDING) {
        throw new BadRequestException('Valid pending loan not found.');
      }

      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + BORROW_PERIOD_DAYS);

      loan.status = LoanStatus.ACTIVE;
      for (const item of loan.loanItems) {
        item.status = LoanItemStatus.BORROWED;
        item.borrowedAt = now;
        item.dueDate = dueDate;
        item.bookCopy.status = CopyStatus.BORROWED;
      }

      await repos.bookCopies.save(loan.loanItems.map((item) => item.bookCopy));
      await repos.loanItems.save(loan.loanItems);
      return repos.loans.save(loan);
    });
  }

  async rejectLoan(loanId: string): Promise<RejectLoanResult> {
    return this.inTransaction(async (repos) => {
      const loan = await this.findLoanWithItems(repos.loans, loanId);
      if (!loan || loan.status !== LoanStatus.PENDING) {
        throw new BadRequestException('Valid pending loan not found.');
      }

      loan.status = LoanStatus.REJECTED;
      for (const item of loan.loanItems) {
        item.bookCopy.status = CopyStatus.AVAILABLE;
      }

      await repos.bookCopies.save(loan.loanItems.map((item) => item.bookCopy));
      await repos.loans.save(loan);

      return {
        id: loan.id,
        memberId: loan.memberId,
        loanCode: loan.loanCode,
        status: loan.status,
        items: loan.loanItems.map((item) => ({
          id: item.id,
          bookCopyId: item.bookCopyId,
        })),
      };
    });
  }

  async returnLoan(loanId: string): Promise<ReturnLoanResult> {
    return this.inTransaction(async (repos) => {
      const loan = await this.findLoanWithItems(repos.loans, loanId);
      if (!loan || loan.status !== LoanStatus.ACTIVE) {
        throw new BadRequestException('Active loan not found.');
      }

      const member = await repos.members.findOne({
        where: { id: loan.memberId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!member) throw new NotFoundException('Member not found');

      const now = new Date();
      let totalFine = 0;
      let maxOverdueDays = 0;
      const depositBefore = Number(member.depositAmount);

      const returnedItems: ReturnedItem[] = [];
      for (const item of loan.loanItems) {
        item.status = LoanItemStatus.RETURNED;
        item.returnedAt = now;
        item.bookCopy.status = CopyStatus.AVAILABLE;

        const overdueDays = overdueDaysFor(item.dueDate, now);
        if (overdueDays > 0) {
          item.fineAmount = +(overdueDays * FINE_PER_DAY).toFixed(2);
          totalFine += item.fineAmount;
          maxOverdueDays = Math.max(maxOverdueDays, overdueDays);
        }

        returnedItems.push({
          id: item.id,
          bookCopyId: item.bookCopyId,
          status: item.status,
          returnedAt: item.returnedAt,
          overdueDays,
          fineAmount: Number(item.fineAmount),
        });
      }

      if (totalFine > 0) {
        member.depositAmount = Math.max(0, +(depositBefore - totalFine).toFixed(2));
        member.blockedUntil = new Date(now.getTime() + maxOverdueDays * BLOCK_MULTIPLIER * DAY_MS);
        await repos.members.save(member);
      }

      loan.status = LoanStatus.COMPLETED;
      await repos.bookCopies.save(loan.loanItems.map((item) => item.bookCopy));
      await repos.loanItems.save(loan.loanItems);
      await repos.loans.save(loan);

      return {
        id: loan.id,
        memberId: loan.memberId,
        loanCode: loan.loanCode,
        status: loan.status,
        items: returnedItems,
        totalFine: +totalFine.toFixed(2),
        blockedUntil: member.blockedUntil,
      };
    });
  }

  async getLoan(loanId: string): Promise<LoanDetail> {
    const loan = await this.findLoanWithItems(this.loanRepository, loanId);
    if (!loan) throw new NotFoundException('Loan not found.');

    const now = new Date();
    const items: LoanItemDetail[] = loan.loanItems.map((item) => {
      const overdueDays = item.returnedAt
        ? overdueDaysFor(item.dueDate, item.returnedAt)
        : overdueDaysFor(item.dueDate, now);
      const accruingFine = item.returnedAt
        ? Number(item.fineAmount)
        : +(overdueDays * FINE_PER_DAY).toFixed(2);
      return {
        id: item.id,
        bookCopyId: item.bookCopyId,
        status: item.status,
        borrowedAt: item.borrowedAt,
        dueDate: item.dueDate,
        returnedAt: item.returnedAt,
        overdueDays,
        fineAmount: accruingFine,
      };
    });

    return {
      id: loan.id,
      memberId: loan.memberId,
      loanCode: loan.loanCode,
      loanDate: loan.loanDate,
      status: loan.status,
      items,
      totalFine: +items.reduce((sum, i) => sum + i.fineAmount, 0).toFixed(2),
    };
  }

  // Runs `work` in one database transaction, with every repository bound to it
  private inTransaction<T>(work: (repos: LoanRepositories) => Promise<T>): Promise<T> {
    return this.loanRepository.manager.transaction((manager: EntityManager) =>
      work({
        loans: manager.withRepository(this.loanRepository),
        loanItems: manager.withRepository(this.loanItemRepository),
        bookCopies: manager.withRepository(this.bookCopyRepository),
        members: manager.withRepository(this.memberRepository),
      }),
    );
  }

  private findLoanWithItems(loans: Repository<Loan>, loanId: string): Promise<Loan | null> {
    return loans.findOne({
      where: { id: loanId },
      relations: { loanItems: { bookCopy: true } },
    });
  }

  private countOverdueItems(
    loanItems: Repository<LoanItem>,
    memberId: string,
    now: Date,
  ): Promise<number> {
    return loanItems
      .createQueryBuilder('item')
      .innerJoin('item.loan', 'loan')
      .where('loan.member_id = :memberId', { memberId })
      .andWhere('item.returned_at IS NULL')
      .andWhere('item.status IN (:...statuses)', {
        statuses: [LoanItemStatus.BORROWED, LoanItemStatus.OVERDUE],
      })
      .andWhere('item.due_date < :now', { now })
      .getCount();
  }
}

interface LoanRepositories {
  loans: Repository<Loan>;
  loanItems: Repository<LoanItem>;
  bookCopies: Repository<BookCopy>;
  members: Repository<Member>;
}

function overdueDaysFor(dueDate: Date | null, asOf: Date): number {
  if (!dueDate) return 0;
  const diff = asOf.getTime() - dueDate.getTime();
  return diff > 0 ? Math.ceil(diff / DAY_MS) : 0;
}

export interface LoanItemDetail {
  id: string;
  bookCopyId: string;
  status: string;
  borrowedAt: Date | null;
  dueDate: Date | null;
  returnedAt: Date | null;
  overdueDays: number;
  fineAmount: number;
}

export interface LoanDetail {
  id: string;
  memberId: string;
  loanCode: string;
  loanDate: Date;
  status: string;
  items: LoanItemDetail[];
  totalFine: number;
}

export interface ReturnedItem {
  id: string;
  bookCopyId: string;
  status: string;
  returnedAt: Date;
  overdueDays: number;
  fineAmount: number;
}

export interface RejectLoanResult {
  id: string;
  memberId: string;
  loanCode: string;
  status: string;
  items: { id: string; bookCopyId: string }[];
}

export interface ReturnLoanResult {
  id: string;
  memberId: string;
  loanCode: string;
  status: string;
  items: ReturnedItem[];
  totalFine: number;
  blockedUntil: Date | null;
}
