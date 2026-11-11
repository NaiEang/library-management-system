import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// The admin's on/off switch. The stored status value itself is never taken
// from the client.
export class SetAccountStatusDto {
  @ApiProperty({
    description: 'true = active, false = disabled (cannot log in)',
  })
  @IsBoolean()
  enabled: boolean;
}
