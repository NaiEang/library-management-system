import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLog } from './../dashboard/entities/activity-log.entity';
import { LoanItem } from '../loans/entities/loan-item.entity';
import { NotifierModule } from './channels/notifier.module';
import { Notification } from './entities/notification.entity';
import { TelegramLink } from './entities/telegram-link.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OverdueController } from './overdue/overdue.controller';
import { OverdueNotificationProcessor } from './overdue/overdue-notification.processor';
import { OverdueScanService } from './overdue/overdue-scan.service';
import { OVERDUE_QUEUE } from './overdue/overdue.constants';
import { TelegramBotPoller } from './telegram/telegram-bot.poller';
import { TelegramLinkService } from './telegram/telegram-link.service';
import { TelegramController } from './telegram/telegram.controller';

@Module({
  controllers: [NotificationsController, OverdueController, TelegramController],
  providers: [
    NotificationsService,
    OverdueScanService,
    OverdueNotificationProcessor,
    TelegramLinkService,
    TelegramBotPoller,
  ],
  imports: [
    TypeOrmModule.forFeature([Notification, ActivityLog, LoanItem, TelegramLink]),
    NotifierModule,
    BullModule.registerQueue({ name: OVERDUE_QUEUE }),
    BullBoardModule.forFeature({ name: OVERDUE_QUEUE, adapter: BullMQAdapter }),
  ],
})
export class NotificationsModule {}
