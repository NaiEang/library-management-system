import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationType } from '../enums/notification-type.enum';

export class SendNotificationDto {
  @ApiProperty({ example: '7', description: 'Target user ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'Library Closed Tomorrow', description: 'Notification title' })
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({
    example: 'The library will be closed tomorrow for maintenance. Please plan accordingly.',
    description: 'Notification message body',
  })
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    enum: NotificationType,
    default: NotificationType.GENERAL,
    example: NotificationType.GENERAL,
    description: 'Notification type',
  })
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType = NotificationType.GENERAL;

  @ApiPropertyOptional({
    example: ['email', 'telegram'],
    description: 'Channels to send via. Omit to send to all configured channels.',
    type: [String],
  })
  @IsOptional()
  @IsString({ each: true })
  channels?: ('email' | 'telegram')[];
}
