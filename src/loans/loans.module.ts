import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookCopy } from '../books/entities/book-copy.entity';
import { Member } from '../members/entities/member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoanItem } from './entities/loan-item.entity';
import { Loan } from './entities/loan.entity';
import { LoanNotificationService } from './loan-notification.service';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  controllers: [LoansController],
  providers: [LoansService, LoanNotificationService],
  imports: [
    TypeOrmModule.forFeature([Loan, LoanItem, BookCopy, Member]),
    NotificationsModule,
  ],
})
export class LoansModule {}
