import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BOOK_ITEM_TYPES } from '../book-item-type.constants';

export class ListBooksQueryDto {
  @ApiPropertyOptional({
    example: 'rowling fantasy',
    description: 'Search words. Matches titles, author names and category names.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 1, description: 'Only books in this category' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ enum: BOOK_ITEM_TYPES, description: 'Only this kind of item' })
  @IsOptional()
  @IsIn(BOOK_ITEM_TYPES)
  itemType?: string;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'The nextCursor value from the previous response' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}