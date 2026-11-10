import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { COPY_CONDITIONS } from '../book-copy.constants';

export class CreateBookCopiesDto {
  @ApiPropertyOptional({ example: 3, default: 1, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
  @ApiPropertyOptional({ enum: COPY_CONDITIONS, default: 'new' })
  @IsOptional()
  @IsIn(COPY_CONDITIONS)
  condition?: string;
  @ApiPropertyOptional({ example: 'Shelf A2' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}