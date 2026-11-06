import { registerAs } from '@nestjs/config';
import { isValidTimeZone } from '../../members/library-date';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';

export interface AuthConfig {
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshIdleTtlSeconds: number;
  refreshAbsoluteTtlMemberSeconds: number;
  refreshAbsoluteTtlStaffSeconds: number;
  frontendOrigin: string;
  depositAmount: number;
  // IANA zone that defines the library's "today" (membership expiry).
  libraryTimeZone: string;
}

const DURATION = /^\d+[smhd]$/;
const DURATION_MESSAGE = '$property must be a duration such as 15m, 12h or 7d';
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;
const MAX_ACCESS_TTL_SECONDS = 3600;
const PLACEHOLDER_SECRET =
  /change.?me|example|placeholder|your.?secret|^secret$/i;

class AuthEnv {
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  FRONTEND_ORIGIN: string;

  @IsOptional()
  @Matches(DURATION, { message: DURATION_MESSAGE })
  JWT_ACCESS_TTL = '15m';

  @IsOptional()
  @Matches(DURATION, { message: DURATION_MESSAGE })
  REFRESH_IDLE_TTL = '7d';

  @IsOptional()
  @Matches(DURATION, { message: DURATION_MESSAGE })
  REFRESH_ABSOLUTE_TTL_MEMBER = '30d';

  @IsOptional()
  @Matches(DURATION, { message: DURATION_MESSAGE })
  REFRESH_ABSOLUTE_TTL_STAFF = '12h';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  DEPOSIT_AMOUNT = 5;

  @IsOptional()
  @IsString()
  LIBRARY_TIME_ZONE = 'Asia/Phnom_Penh';
}

export function durationToSeconds(value: string): number {
  const unit = value.slice(-1) as keyof typeof UNIT_SECONDS;
  return Number(value.slice(0, -1)) * UNIT_SECONDS[unit];
}

// Validates only this module's variables and fails fast at startup.
// Error messages name the variable but never echo its value.
export function validateAuthEnv(env: Record<string, unknown>): AuthConfig {
  const parsed = plainToInstance(AuthEnv, env, { exposeDefaultValues: true });
  const problems = validateSync(parsed, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  }).flatMap((error) => Object.values(error.constraints ?? {}));

  if (
    parsed.JWT_ACCESS_SECRET &&
    PLACEHOLDER_SECRET.test(parsed.JWT_ACCESS_SECRET)
  ) {
    problems.push(
      'JWT_ACCESS_SECRET looks like a placeholder; generate a random one',
    );
  }
  if (parsed.JWT_ACCESS_SECRET && new Set(parsed.JWT_ACCESS_SECRET).size < 10) {
    problems.push('JWT_ACCESS_SECRET is too repetitive; generate a random one');
  }
  if (parsed.FRONTEND_ORIGIN && !isOrigin(parsed.FRONTEND_ORIGIN)) {
    problems.push(
      'FRONTEND_ORIGIN must be an origin like https://app.example.com (no path)',
    );
  }
  if (
    problems.length === 0 &&
    durationToSeconds(parsed.JWT_ACCESS_TTL) > MAX_ACCESS_TTL_SECONDS
  ) {
    problems.push('JWT_ACCESS_TTL must be at most 1h');
  }
  if (parsed.LIBRARY_TIME_ZONE && !isValidTimeZone(parsed.LIBRARY_TIME_ZONE)) {
    problems.push(
      'LIBRARY_TIME_ZONE must be an IANA time zone such as Asia/Phnom_Penh',
    );
  }
  if (problems.length > 0) {
    throw new Error(`Invalid auth configuration:\n- ${problems.join('\n- ')}`);
  }

  return {
    jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
    jwtAccessTtlSeconds: durationToSeconds(parsed.JWT_ACCESS_TTL),
    refreshIdleTtlSeconds: durationToSeconds(parsed.REFRESH_IDLE_TTL),
    refreshAbsoluteTtlMemberSeconds: durationToSeconds(
      parsed.REFRESH_ABSOLUTE_TTL_MEMBER,
    ),
    refreshAbsoluteTtlStaffSeconds: durationToSeconds(
      parsed.REFRESH_ABSOLUTE_TTL_STAFF,
    ),
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    depositAmount: parsed.DEPOSIT_AMOUNT,
    libraryTimeZone: parsed.LIBRARY_TIME_ZONE,
  };
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

export const authConfig = registerAs('auth', (): AuthConfig =>
  validateAuthEnv(process.env),
);
