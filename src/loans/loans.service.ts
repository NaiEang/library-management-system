import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { BookCopy } from '../books/entities/book-copy.entity';
import { CopyStatus, LoanItemStatus, LoanStatus } from '../common/constants';
import { Member } from '../members/entities/member.entity';
import { LoanItem } from './entities/loan-item.entity';
import { Loan } from './entities/loan.entity';

const BORROW_PERIOD_DAYS = 14;
const REQUIRED_DEPOSIT = 5;

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

  async requestLoan(memberId: string, bookCopyIds: string[]): Promise<Loan> {
    return this.inTransaction(async (repos) => {
      const member = await repos.members.findOne({ where: { id: memberId } });
      if (!member) throw new NotFoundException('Member not found');

      if (Number(member.depositAmount) < REQUIRED_DEPOSIT) {
        throw new BadRequestException(
          `Account not verified. A $${REQUIRED_DEPOSIT} deposit is required.`,
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

  async returnLoan(loanId: string): Promise<Loan> {
    return this.inTransaction(async (repos) => {
      const loan = await this.findLoanWithItems(repos.loans, loanId);
      if (!loan || loan.status !== LoanStatus.ACTIVE) {
        throw new BadRequestException('Active loan not found.');
      }

      const now = new Date();
      loan.status = LoanStatus.COMPLETED;
      for (const item of loan.loanItems) {
        item.status = LoanItemStatus.RETURNED;
        item.returnedAt = now;
        item.bookCopy.status = CopyStatus.AVAILABLE;
      }

      await repos.bookCopies.save(loan.loanItems.map((item) => item.bookCopy));
      await repos.loanItems.save(loan.loanItems);
      return repos.loans.save(loan);
    });
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
