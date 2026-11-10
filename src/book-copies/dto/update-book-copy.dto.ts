import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { COPY_CONDITIONS, MANUAL_COPY_STATUSES } from '../book-copy.constants';

export class UpdateBookCopyDto {
  @ApiPropertyOptional({ enum: MANUAL_COPY_STATUSES })
  @IsOptional()
  @IsIn(MANUAL_COPY_STATUSES)
  status?: string;
  @ApiPropertyOptional({ enum: COPY_CONDITIONS })
  @IsOptional()
  @IsIn(COPY_CONDITIONS)
  condition?: string;
  @ApiPropertyOptional({ example: 'Shelf B1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}