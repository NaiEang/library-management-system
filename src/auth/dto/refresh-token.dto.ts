import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RefreshTokenDto {
  // 32 random bytes in base64url, exactly as issued at login or refresh
  @ApiProperty({
    description: 'The refreshToken from login or the last refresh',
  })
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'refreshToken has an invalid format',
  })
  refreshToken: string;
}
