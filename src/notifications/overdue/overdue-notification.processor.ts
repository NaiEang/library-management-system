import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { LoanItemStatus } from '../../common/constants';
import { withSpan } from '../../common/observability/with-span';
import { LoanItem } from '../../loans/entities/loan-item.entity';
import { NOTIFIER, type Notifier } from '../channels/notifier';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from '../notifications.service';
import {
  OVERDUE_QUEUE,
  overdueMessage,
  type OverdueJobData,
} from './overdue.constants';

export type OverdueJobResult =
  | { sent: true; channel: string; notificationId: string }
  | { sent: false; reason: 'not-found' | 'no-longer-overdue' };

@Processor(OVERDUE_QUEUE)
export class OverdueNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger('OverdueNotification');

  constructor(
    @InjectRepository(LoanItem)
    private readonly loanItems: Repository<LoanItem>,
    private readonly notifications: NotificationsService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {
    super();
  }

  async process(job: Job<OverdueJobData>): Promise<OverdueJobResult> {
    const { loanItemId } = job.data;
    return withSpan(
      'overdue.notify',
      async () => {
        const item = await this.loanItems.findOne({
          where: { id: loanItemId },
          relations: { loan: { member: { user: true } }, bookCopy: { book: true } },
        });
        if (!item) return { sent: false, reason: 'not-found' };
        // Returned between the scan and now: nothing to remind about
        if (item.returnedAt || item.status !== LoanItemStatus.OVERDUE) {
          return { sent: false, reason: 'no-longer-overdue' };
        }

        const user = item.loan.member.user;
        const title = 'Book overdue';
        const message = overdueMessage(item.bookCopy.book.title);

        let notificationId = job.data.notificationId;
        if (!notificationId) {
          const saved = await this.notifications.create({
            userId: user.id,
            type: NotificationType.LOAN_OVERDUE,
            title,
            message,
          });
          notificationId = saved.id;
          await job.updateData({ ...job.data, notificationId });
        }

        await this.notifier.send({
          to: {
            userId: user.id,
            email: user.email ?? null,
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
          },
          subject: title,
          text: message,
        });

        this.logger.log(
          `loan item ${loanItemId}: reminded user ${user.id} via ${this.notifier.channel}`,
        );
        return { sent: true, channel: this.notifier.channel, notificationId };
      },
      { 'loan_item.id': loanItemId, 'job.attempt': job.attemptsMade + 1 },
    );
  }
}
