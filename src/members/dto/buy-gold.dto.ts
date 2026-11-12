import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { GoldPaymentMethod } from '../gold-membership.service';

// Only how the member paid. The amount comes from GOLD_MEMBERSHIP_FEE and the
// dates from the server, never from the client.
export class BuyGoldDto {
  @ApiPropertyOptional({
    enum: GoldPaymentMethod,
    default: GoldPaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(GoldPaymentMethod)
  paymentMethod: GoldPaymentMethod = GoldPaymentMethod.CASH;
}
