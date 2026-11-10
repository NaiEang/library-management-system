import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../users/normalize';

export class LoginDto {
  @ApiProperty({ example: 'good.student@demo.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;

  // No policy check at login: the error must not hint at the rules. The cap
  // (128 characters can take up to 512 UTF-16 units) bounds the hashing work.
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  password: string;
}
