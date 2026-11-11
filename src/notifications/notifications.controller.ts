import { Controller,Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '../common/constants';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}


  // Staff only: it can address a notification to any user
  @Roles(RoleName.ADMIN, RoleName.LIBRARIAN)
  @Post()
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }


  // Get all notifications
  // @Get()
  // findAll() {
  //   return this.notificationsService.findAll();
  // }

  // // Get unread notification count
  // @Get('unread-count')
  // getUnreadCount() {
  //   return this.notificationsService.getUnreadCount();
  // }

  // // Mark one notification as read
  // @Patch(':id/read')
  // markAsRead(@Param('id') id: string) {
  //   return this.notificationsService.markAsRead(id);
  // }

  // // Mark all notifications as read
  // @Patch('read-all')
  // markAllAsRead() {
  //   return this.notificationsService.markAllAsRead();
  // }
}