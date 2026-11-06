import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { authConfig } from '../auth/config/auth.config';
import { PasswordService } from '../auth/password/password.service';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembersModule } from '../members/members.module';

@Module({
  controllers: [UsersController],
  // PasswordService lives here (not in AuthModule) because AuthModule imports
  // this module; one instance serves both.
  providers: [UsersService, PasswordService],
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([User, Role]),
    MembersModule,
  ],
  exports: [UsersService, PasswordService],
})
export class UsersModule {}
