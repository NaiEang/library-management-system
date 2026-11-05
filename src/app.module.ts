import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { BooksModule } from './books/books.module';
import { LoansModule } from './loans/loans.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { Payment } from './payments/entities/payment.entity';
import { LoanItem } from './loans/entities/loan-item.entity';
import { Loan } from './loans/entities/loan.entity';
import { BookAuthor } from './books/entities/book-author.entity';
import { BookCopy } from './books/entities/book-copy.entity';
import { Category } from './books/entities/category.entity';
import { Author } from './books/entities/author.entity';
import { Book } from './books/entities/book.entity';
import { Member } from './members/entities/member.entity';
import { Role } from './users/entities/role.entity.js';
import { User } from './users/entities/user.entity';
import { ActivityLog } from './dashboard/entities/activity-log.entity';
import { Notification } from './notifications/entities/notification.entity';
import { CategoriesModule } from './categories/categories.module';
import { AuthorsModule } from './authors/authors.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          User,
          Role,
          Member,
          Book,
          Author,
          Category,
          BookCopy,
          BookAuthor,
          Loan,
          LoanItem,
          Payment,
          ActivityLog,
          Notification,
        ],
        autoLoadEntities: true,
        synchronize: false,
        ssl: {
          rejectUnauthorized: false,
        },
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
    }),
    AuthModule,
    UsersModule,
    MembersModule,
    BooksModule,
    CategoriesModule,
    AuthorsModule,
    LoansModule,
    PaymentsModule,
    NotificationsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
