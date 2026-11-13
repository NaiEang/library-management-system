import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
export class CreateBookDto {
  @ApiProperty({ example: 'TEST-Harry Potter' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    example: 'book',
    enum: ['book', 'limited_edition', 'research_paper'],
    description: 'Type of item (book, limited_edition, research_paper)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemType?: string;
  @ApiPropertyOptional({ example: '9780747532699' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  isbn?: string;
  @ApiPropertyOptional({ example: 'Bloomsbury' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publisher?: string;
  @ApiPropertyOptional({ example: '1997-06-26' })
  @IsOptional()
  @IsDateString()
  publishedDate?: string;
  @ApiPropertyOptional({ example: 'A boy discovers he is a wizard.' })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ example: 'English' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;
  @ApiPropertyOptional({ example: 1, nullable: true })
  @IsOptional()
  @IsInt()
  categoryId?: number | null;
  @ApiProperty({
    example: [1],
    description: 'IDs of existing authors (at least one)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  authorIds: number[];
}
