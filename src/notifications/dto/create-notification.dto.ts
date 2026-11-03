import {
    IsEnum,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

import {NotificationType} from '../enums/notification-type.enum';

export class CreateNotificationDto {
  userId: string;

  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsNotEmpty()
  message: string;

  @IsEnum(NotificationType)
  type: NotificationType;
}