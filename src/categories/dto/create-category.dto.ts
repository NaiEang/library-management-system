import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateCategoryDto {
  @ApiProperty({ example: 'Fantasy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
  @ApiPropertyOptional({ example: 'Magic, dragons and quests' })
  @IsOptional()
  @IsString()
  description?: string;
}
