import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class RequestLoanDto {
  // Staff borrow on behalf of a member and must say which one. A member always
  // borrows for themselves: leave it out, or send their own member id.
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiProperty({ type: [String], example: ['10'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  bookCopyIds: string[];
}
