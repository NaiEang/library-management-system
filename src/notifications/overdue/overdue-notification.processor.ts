import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { LoanItemStatus } from '../../common/constants';
import { withSpan } from '../../common/observability/with-span';
import { LoanItem } from '../../loans/entities/loan-item.entity';
import {
  daysBetween,
  formatLibraryDate,
  libraryToday,
} from '../../members/library-date';
import { NOTIFIERS, type Notifier } from '../channels/notifier';
import { NotificationsService } from '../notifications.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import {
  OVERDUE_QUEUE,
  REMINDERS,
  type OverdueJobData,
} from './overdue.constants';

export type OverdueJobResult =
  | { sent: true; channels: string[]; notificationId: string }
  | { sent: false; reason: 'not-found' | 'no-longer-applies' };

@Processor(OVERDUE_QUEUE)
export class OverdueNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger('OverdueNotification');
  private readonly timeZone: string;

  constructor(
    @InjectRepository(LoanItem)
    private readonly loanItems: Repository<LoanItem>,
    private readonly notifications: NotificationsService,
    @Inject(NOTIFIERS) private readonly notifiers: Notifier[],
    private readonly telegramLinks: TelegramLinkService,
    config: ConfigService,
  ) {
    super();
    this.timeZone =
      config.get<string>('LIBRARY_TIME_ZONE') ?? 'Asia/Phnom_Penh';
  }

  async process(job: Job<OverdueJobData>): Promise<OverdueJobResult> {
    const { loanItemId } = job.data;
    const kind = job.data.kind ?? 'overdue';
    const reminder = REMINDERS[kind];
    return withSpan(
      'overdue.notify',
      async () => {
        const item = await this.loanItems.findOne({
          where: { id: loanItemId },
          relations: {
            loan: { member: { user: true } },
            bookCopy: { book: true },
          },
        });
        if (!item) return { sent: false, reason: 'not-found' };
        // Returned (or, for a due-date reminder, already overdue) between
        // the scan and now: this reminder no longer applies
        const expected =
          kind === 'overdue' ? LoanItemStatus.OVERDUE : LoanItemStatus.BORROWED;
        if (item.returnedAt || item.status !== expected) {
          return { sent: false, reason: 'no-longer-applies' };
        }

        const user = item.loan.member.user;
        const title = reminder.title;
        const due = item.dueDate ?? new Date();
        const message = reminder.message({
          bookTitle: item.bookCopy.book.title,
          dueDate: formatLibraryDate(this.timeZone, due),
          daysOverdue: Math.max(
            0,
            daysBetween(
              libraryToday(this.timeZone, due),
              libraryToday(this.timeZone, new Date()),
            ),
          ),
        });

        let notificationId = job.data.notificationId;
        if (!notificationId) {
          const saved = await this.notifications.create({
            userId: user.id,
            type: reminder.type,
            title,
            message,
          });
          notificationId = saved.id;
          await job.updateData({ ...job.data, notificationId });
        }

        const to = {
          userId: user.id,
          email: user.email ?? null,
          name:
            [user.firstName, user.lastName].filter(Boolean).join(' ') ||
            user.username,
          telegramChatId: await this.telegramLinks.chatIdOf(user.id),
        };
        // Each channel once: a retry skips the ones that already delivered
        const delivered = new Set(job.data.delivered ?? []);
        for (const notifier of this.notifiers) {
          if (delivered.has(notifier.channel)) continue;
          await notifier.send({
            to,
            subject: title,
            text: message,
            icon: reminder.icon,
          });
          delivered.add(notifier.channel);
          await job.updateData({
            ...job.data,
            notificationId,
            delivered: [...delivered],
          });
        }

        const channels = this.notifiers.map((n) => n.channel);
        this.logger.log(
          `loan item ${loanItemId}: ${kind} reminder to user ${user.id} via ${channels.join(', ')}`,
        );
        return { sent: true, channels, notificationId };
      },
      {
        'loan_item.id': loanItemId,
        'reminder.kind': kind,
        'job.attempt': job.attemptsMade + 1,
      },
    );
  }
}
