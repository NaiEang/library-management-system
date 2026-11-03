import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class RequestLoanDto {
  @IsString()
  memberId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  bookCopyIds: string[];
}