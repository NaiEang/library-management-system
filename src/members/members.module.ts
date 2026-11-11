import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../auth/config/auth.config';
import { Member } from './entities/member.entity';
import { MembersService } from './members.service';
import { MembershipService } from './membership.service';

// No routes of its own: the member endpoints live under /users.
// Other modules import this module to use MembershipService.canBorrow().
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    TypeOrmModule.forFeature([Member]),
  ],
  providers: [MembershipService, MembersService],
  exports: [MembershipService, MembersService],
})
export class MembersModule {}
