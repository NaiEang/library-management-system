import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  normalizeEmail,
  normalizeUsername,
  USERNAME_PATTERN,
} from '../../users/normalize';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Only these fields are accepted. role, status, membership and deposit fields
// are never read from the client (the global ValidationPipe strips them).
export class RegisterDto {
  @ApiProperty({ example: 'good.student@demo.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'goodstudent',
    description: '3-30 characters: a-z, 0-9, dot, underscore, hyphen',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeUsername(value) : value,
  )
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3-30 characters: a-z, 0-9, dot, underscore or hyphen',
  })
  username: string;

  // The password policy (needs email and username) runs in the service.
  @ApiProperty({
    format: 'password',
    description: '8-128 characters, not a common password',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+855 12 345 678' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,29}$/, {
    message:
      'phone must contain only digits, spaces, (), - and an optional leading +',
  })
  phone?: string;
}
