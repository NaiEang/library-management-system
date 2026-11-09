import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LogActivity } from '../dashboard/decorators/log-activity.decorator';
import { UserProfileResponse } from '../users/mappers/user-profile.mapper';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './types/auth-user';
import { Public } from './decorators/public.decorator';
import { LoginResponse, RegisterResponse } from './dto/auth-responses';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import {
  PASSWORD_CHANGE_THROTTLE,
  REGISTER_THROTTLE,
} from './throttling/auth-throttle';
import { AuthThrottlerGuard } from './throttling/auth-throttler.guard';
import { REFRESH_COOKIE, refreshCookieOptions } from './tokens/refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly adapterHost: HttpAdapterHost,
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

  // The access token goes in the body (the frontend keeps it in memory); the
  // refresh token goes only in the httpOnly cookie.
  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { body, refresh } = await this.authService.login({
      email: dto.email,
      password: dto.password,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    this.adapterHost.httpAdapter.setCookie(
      res,
      REFRESH_COOKIE,
      refresh.token,
      refreshCookieOptions(refresh.expiresAt),
    );
    return body;
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
