import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { UserProfileResponse } from '../users/mappers/user-profile.mapper';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginResponse } from './dto/auth-responses';
import { LoginDto } from './dto/login.dto';
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
}
