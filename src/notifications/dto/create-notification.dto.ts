import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NotificationType } from '../enums/notification-type.enum';

export class CreateNotificationDto {
  @ApiProperty({ example: '7', description: 'Target user ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'Welcome to LibraFlow!', description: 'Notification title' })
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    example: 'Thank you for joining our library. Enjoy reading!',
    description: 'Notification message body',
  })
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.GENERAL,
    description: 'Notification type',
  })
  @IsEnum(NotificationType)
  type: NotificationType;
}
