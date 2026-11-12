import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { MembersModule } from '../members/members.module';
import { NotifierModule } from '../notifications/channels/notifier.module';
import { UsersModule } from '../users/users.module';
import { AccountsService } from './accounts/accounts.service';
import { UserAccountsController } from './accounts/user-accounts.controller';
import { AuthAuditService } from './audit/auth-audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { authConfig } from './config/auth.config';
import { EmailVerificationCode } from './entities/email-verification-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationService } from './email-verification/email-verification.service';
import { GoldMemberGuard } from './guards/gold-member.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AUTH_THROTTLE_OPTIONS } from './throttling/auth-throttle';
import { RefreshTokenService } from './tokens/refresh-token.service';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([RefreshToken, User, EmailVerificationCode]),
    // ThrottlerModule is global; its limits apply only where AuthThrottlerGuard is used.
    ThrottlerModule.forRoot(AUTH_THROTTLE_OPTIONS),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtAccessSecret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.jwtAccessTtlSeconds,
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    UsersModule,
    // MembershipService, for GoldMemberGuard.
    MembersModule,
    // EmailNotifier: emails the verification code (printed in development).
    NotifierModule,
  ],
  controllers: [AuthController, UserAccountsController],
  providers: [
    AuthService,
    AuthAuditService,
    AccountsService,
    RefreshTokenService,
    EmailVerificationService,
    JwtStrategy,
    // Global guards run in this order: authentication, then roles, then
    // @GoldMember() (which needs the user the first guard loaded).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: GoldMemberGuard },
  ],
})
export class AuthModule {}
