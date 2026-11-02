import { Module } from '@nestjs/common';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { Member } from '../members/entities/member.entity';
import { BookCopy } from '../books/entities/book-copy.entity';
import { LoanItem } from './entities/loan-item.entity';
import { Loan } from './entities/loan.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [LoansController],
  providers: [LoansService],
  imports: [TypeOrmModule.forFeature([Loan, LoanItem, BookCopy, Member])], // Add this line to include the Loan, LoanItem, BookCopy, and Member entities
})
export class LoansModule {}
