
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
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
}
