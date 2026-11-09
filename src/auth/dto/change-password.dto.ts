import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  currentPassword: string;

  // The password policy (needs the email and username) runs in the service.
  @ApiProperty({
    format: 'password',
    description: '8-128 characters, not a common password',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  newPassword: string;
}
