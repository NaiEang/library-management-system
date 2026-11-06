import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { authConfig } from '../auth/config/auth.config';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembersModule } from '../members/members.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([User, Role]),
    MembersModule,
  ],
  exports: [UsersService],
})
export class UsersModule {}
