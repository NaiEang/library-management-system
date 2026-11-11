import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LogActivity } from '../dashboard/decorators/log-activity.decorator';
import { UserProfileResponse } from '../users/mappers/user-profile.mapper';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './types/auth-user';
import { Public } from './decorators/public.decorator';
import {
  LoginResponse,
  RegisterResponse,
  TokenResponse,
} from './dto/auth-responses';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  PASSWORD_CHANGE_THROTTLE,
  REGISTER_THROTTLE,
} from './throttling/auth-throttle';
import { AuthThrottlerGuard } from './throttling/auth-throttler.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // Creates a MEMBER (membership pending_deposit). No tokens: the user logs
  // in afterwards. 409 when the email or username is taken (an accepted
  // trade-off; the rate limit protects against mass email checks).
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ email: true })
  @Throttle(REGISTER_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(dto);
  }

  // Both tokens go in the body (backend-only: no cookies). Send the access
  // token as a Bearer token; keep the refresh token for POST /auth/refresh.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.authService.login({
      email: dto.email,
      password: dto.password,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // No access token needed (it may have expired): the refresh token is the
  // proof. Each refresh token works once and is replaced by a new one.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ email: true })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<TokenResponse> {
    return this.authService.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // Ends this login session (all tokens from that login). Always 204, so it
  // doesn't reveal whether a token exists.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ email: true })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser('id') userId: string): Promise<UserProfileResponse> {
    const profile = await this.usersService.findProfile(userId);
    // The user was deleted between the guard check and this query.
    if (!profile) {
      throw new UnauthorizedException();
    }
    return profile;
  }

  // Ends all of this user's sessions: log in again with the new password.
  @ApiBearerAuth()
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ email: true })
  @Throttle(PASSWORD_CHANGE_THROTTLE)
  @LogActivity({ action: 'UPDATE', entityType: 'Password' })
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user, dto);
  }
}
