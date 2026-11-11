import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import {NotificationType} from '../enums/notification-type.enum';

export class CreateNotificationDto {
  // Without a validator the global whitelist pipe would strip it
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsNotEmpty()
  message: string;

  @IsEnum(NotificationType)
  type: NotificationType;
}