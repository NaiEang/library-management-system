import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateAuthorDto {
  @ApiProperty({ example: 'J. K. Rowling' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}