
import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { NOTIFIERS, type Notifier } from './channels/notifier';
import { TelegramLinkService } from './telegram/telegram-link.service';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(NOTIFIERS) private readonly notifiers: Notifier[],
    private readonly telegramLinks: TelegramLinkService,
  ) {}

  // Create in-app notification
  async create(
  createNotificationDto: CreateNotificationDto,
): Promise<Notification> {
  const notification = this.notificationRepository.create({
    ...createNotificationDto,
    readAt: null,
  });

  return this.notificationRepository.save(notification);
}

  // Get user's notifications
  async findAll(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        userId,
        readAt: IsNull(),
      },
    });
  }

  // Mark one notification as read
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      {
        userId,
        readAt: IsNull(),
      },
      {
        readAt: new Date(),
      },
    );
  }

  // Send a notification to a user via chosen channels (email, telegram) + in-app
  async send(dto: SendNotificationDto) {
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const notification = await this.create({
      userId: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type!,
    });

    const to = {
      userId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
      telegramChatId: await this.telegramLinks.chatIdOf(user.id),
    };

    const wantedChannels = dto.channels?.length
      ? new Set(dto.channels)
      : new Set(this.notifiers.map((n) => n.channel));

    const delivered: string[] = [];
    for (const notifier of this.notifiers) {
      if (!wantedChannels.has(notifier.channel)) continue;
      await notifier.send({ to, subject: dto.title, text: dto.message });
      delivered.push(notifier.channel);
    }

    return { notification, delivered };
  }
}
