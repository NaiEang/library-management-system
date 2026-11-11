import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BooksModule } from './books/books.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { dbSsl } from './database/ssl';
import { LoansModule } from './loans/loans.module';
import { MembersModule } from './members/members.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { queueDashboardAuth } from './common/queues/queue-dashboard-auth';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { AuthorsModule } from './authors/authors.module';
import { BookCopiesModule } from './book-copies/book-copies.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        // Each module registers its own entities with TypeOrmModule.forFeature(), so this file never changes for them
        autoLoadEntities: true,
        synchronize: false,
        ssl: dbSsl(configService.get<string>('DB_SSL')),
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
        // E2E tests use their own prefix so a dev server's workers never pick
        // up jobs that point at rows in the test database
        prefix: configService.get<string>('BULLMQ_PREFIX') ?? 'bull',
      }),
    }),
    ScheduleModule.forRoot(),
    // BullMQ dashboard at /queues (jobs, failures, retry). Basic auth; off
    // until QUEUE_DASHBOARD_PASSWORD is set. Queues register in their modules.
    BullBoardModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        route: '/queues',
        adapter: ExpressAdapter,
        middleware: queueDashboardAuth({
          user: configService.get<string>('QUEUE_DASHBOARD_USER') || 'admin',
          password: configService.get<string>('QUEUE_DASHBOARD_PASSWORD') ?? '',
        }),
      }),
    }),
    ObservabilityModule,
    AuthModule,
    UsersModule,
    MembersModule,
    BooksModule,
    BookCopiesModule,
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
export class AppModule {}
