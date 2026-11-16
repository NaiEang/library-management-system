import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Member } from '../members/entities/member.entity';
import { NOTIFIERS, type Notifier } from '../notifications/channels/notifier';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramLinkService } from '../notifications/telegram/telegram-link.service';
import { Loan } from './entities/loan.entity';

@Injectable()
export class LoanNotificationService {
  private readonly logger = new Logger('LoanNotification');

  constructor(
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    private readonly notifications: NotificationsService,
    @Inject(NOTIFIERS) private readonly notifiers: Notifier[],
    private readonly telegramLinks: TelegramLinkService,
  ) {}

  onApproved(loan: Loan): void {
    this.send(loan, {
      type: NotificationType.LOAN_APPROVED,
      icon: '✅',
      title: 'Loan approved',
      message:
        `Your loan request (${loan.loanCode}) has been approved. ` +
        `Please collect your books from the library.`,
    });
  }

  onRejected(loan: Loan): void {
    this.send(loan, {
      type: NotificationType.LOAN_REJECTED,
      icon: '❌',
      title: 'Loan request declined',
      message:
        `Your loan request (${loan.loanCode}) has been declined. ` +
        `Please visit the library for more information.`,
    });
  }

  private send(
    loan: Loan,
    detail: { type: NotificationType; icon: string; title: string; message: string },
  ): void {
    this.dispatch(loan, detail).catch((error: Error) =>
      this.logger.error(
        `failed to notify member of loan ${loan.id}: ${error.message}`,
        error.stack,
      ),
    );
  }

  private async dispatch(
    loan: Loan,
    detail: { type: NotificationType; icon: string; title: string; message: string },
  ): Promise<void> {
    const member = await this.members.findOne({
      where: { id: loan.memberId },
      relations: { user: true },
    });
    if (!member) return;

    const user = member.user;
    await this.notifications.create({
      userId: user.id,
      type: detail.type,
      title: detail.title,
      message: detail.message,
    });

    const to = {
      userId: user.id,
      email: user.email ?? null,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username,
      telegramChatId: await this.telegramLinks.chatIdOf(user.id),
    };

    for (const notifier of this.notifiers) {
      await notifier.send({
        to,
        subject: detail.title,
        text: detail.message,
        icon: detail.icon,
      });
    }
  }
}
