import { BookAuthor } from '../books/entities/book-author.entity';
import { BookCopy } from '../books/entities/book-copy.entity';
import { Author } from '../books/entities/author.entity';
import { Book } from '../books/entities/book.entity';
import { Category } from '../books/entities/category.entity';
import { ActivityLog } from '../dashboard/entities/activity-log.entity';
import { LoanItem } from '../loans/entities/loan-item.entity';
import { Loan } from '../loans/entities/loan.entity';
import { Member } from '../members/entities/member.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';

/** Every entity, for scripts that run outside Nest (seeds, test setup). The app itself uses autoLoadEntities. */
export const ENTITIES = [
  Role,
  User,
  Member,
  Category,
  Author,
  Book,
  BookAuthor,
  BookCopy,
  Loan,
  LoanItem,
  Payment,
  Notification,
  ActivityLog,
];
