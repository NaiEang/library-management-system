import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { CODE_PATTERN } from '../email-verification/verification-code';

export class VerifyEmailDto {
  @ApiProperty({
    example: '042917',
    description: 'The 6-digit code from the email',
  })
  @IsString()
  @Matches(CODE_PATTERN, { message: 'code must be 6 digits' })
  code: string;
}
