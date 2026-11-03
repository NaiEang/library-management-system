import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Loan } from './entities/loan.entity';
import { LoanItem } from './entities/loan-item.entity';
import { BookCopy } from '../books/entities/book-copy.entity';
import { Member } from '../members/entities/member.entity';

@Injectable()
export class LoansService {
  constructor(private dataSource: DataSource) {}

  async requestLoan(memberId: string, bookCopyIds: string[]) {
    return this.dataSource.transaction(async (manager) => {
      // 1. Validate Member & Deposit
      const member = await manager.findOne(Member, { where: { id: memberId } });
      if (!member) throw new NotFoundException('Member not found');
      
      if (Number(member.depositAmount) < 5) {
        throw new BadRequestException('Account not verified. A $5 deposit is required.');
      }

      // 2. Enforce Late Block Rule (Check if member has any OVERDUE items)
      const overdueItems = await manager.createQueryBuilder(LoanItem, 'item')
        .innerJoin('item.loan', 'loan')
        .where('loan.member_id = :memberId', { memberId })
        .andWhere('item.status = :status', { status: 'BORROWED' })
        .andWhere('item.due_date < :now', { now: new Date() })
        .getCount();

      if (overdueItems > 0) {
        throw new BadRequestException('Account blocked: You have overdue books.');
      }

      // 3. Verify Copies are Available
      const copies = await manager.findBy(BookCopy, { id: In(bookCopyIds) });
      if (copies.length !== bookCopyIds.length) {
        throw new NotFoundException('One or more book copies not found.');
      }

      for (const copy of copies) {
        if (copy.status !== 'AVAILABLE') {
          throw new BadRequestException(`Copy ${copy.id} is ${copy.status}.`);
        }
      }

      // 4. Create Loan
      const loan = manager.create(Loan, {
        memberId,
        loanDate: new Date(),
        status: 'PENDING',
        loanCode: `LN-${Date.now()}`,
      });
      const savedLoan = await manager.save(loan);

      // 5. Create Loan Items mapped to your new schema
      const loanItems = copies.map((copy: BookCopy) => {
        copy.status = 'RESERVED'; 
        return manager.create(LoanItem, {
          loanId: savedLoan.id,
          bookCopyId: copy.id,
          status: 'PENDING',
        });
      });

      await manager.save(BookCopy, copies);
      await manager.save(LoanItem, loanItems);

      return savedLoan;
    });
  }

  async approveLoan(loanId: string) {
    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, { 
        where: { id: loanId },
        relations: { loanItems: { bookCopy: true } } 
      });

      if (!loan || loan.status !== 'PENDING') throw new BadRequestException('Valid pending loan not found.');

      loan.status = 'ACTIVE';
      const now = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14); // 14-day borrow period

      const copiesToUpdate: BookCopy[] = [];
      
      // Update dates on the individual items based on your new schema
      loan.loanItems.forEach((item: LoanItem) => {
        item.status = 'BORROWED';
        item.borrowedAt = now;
        item.dueDate = dueDate;
        
        item.bookCopy.status = 'BORROWED';
        copiesToUpdate.push(item.bookCopy);
      });

      await manager.save(BookCopy, copiesToUpdate);
      await manager.save(LoanItem, loan.loanItems);
      return manager.save(loan);
    });
  }
  
  async returnLoan(loanId: string) {
    return this.dataSource.transaction(async (manager) => {
      const loan = await manager.findOne(Loan, { 
        where: { id: loanId },
        relations: { loanItems: { bookCopy: true } }
      });

      if (!loan || loan.status !== 'ACTIVE') {
        throw new BadRequestException('Active loan not found.');
      }

      loan.status = 'COMPLETED';
      const now = new Date();
      const copiesToUpdate: BookCopy[] = [];

      loan.loanItems.forEach((item: LoanItem) => {
        item.status = 'RETURNED';
        item.returnedAt = now;
        
        item.bookCopy.status = 'AVAILABLE';
        copiesToUpdate.push(item.bookCopy);
      });

      await manager.save(BookCopy, copiesToUpdate);
      await manager.save(LoanItem, loan.loanItems);
      return manager.save(loan);
    });
  }
}