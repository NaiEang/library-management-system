import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MembershipStatus, MembershipTier } from '../../common/constants';

export class ListMembersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;

  @ApiPropertyOptional({
    enum: MembershipTier,
    description:
      'gold: gold period not ended yet; standard: never gold or gold ended',
  })
  @IsOptional()
  @IsEnum(MembershipTier)
  tier?: MembershipTier;

  @ApiPropertyOptional({
    description: 'true: only verified emails; false: only unverified',
  })
  @IsOptional()
  // Query values arrive as text; anything but "true"/"false" fails IsBoolean.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Part of an email, username or member code',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
