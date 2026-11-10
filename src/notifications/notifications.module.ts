import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from './../dashboard/entities/activity-log.entity';
import { LoanItem } from '../loans/entities/loan-item.entity';
import { notifierProvider } from './channels/notifier.provider';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OverdueController } from './overdue/overdue.controller';
import { OverdueNotificationProcessor } from './overdue/overdue-notification.processor';
import { OverdueScanService } from './overdue/overdue-scan.service';
import { OVERDUE_QUEUE } from './overdue/overdue.constants';

@Module({
  controllers: [NotificationsController, OverdueController],
  providers: [
    NotificationsService,
    notifierProvider,
    OverdueScanService,
    OverdueNotificationProcessor,
  ],
  imports: [
    TypeOrmModule.forFeature([Notification, ActivityLog, LoanItem]),
    BullModule.registerQueue({ name: OVERDUE_QUEUE }),
    BullBoardModule.forFeature({ name: OVERDUE_QUEUE, adapter: BullMQAdapter }),
  ],
})
export class NotificationsModule {}
