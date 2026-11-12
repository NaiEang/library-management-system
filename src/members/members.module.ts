import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { authConfig } from '../auth/config/auth.config';
import { Payment } from '../payments/entities/payment.entity';
import { Member } from './entities/member.entity';
import { GoldMembershipService } from './gold-membership.service';
import { MembersService } from './members.service';
import { MembershipService } from './membership.service';

// No routes of its own: the member endpoints live under /users.
// Other modules import this module to use MembershipService.canBorrow().
@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    // Payment: the gold fee is recorded there (the payments module itself
    // isn't touched).
    TypeOrmModule.forFeature([Member, Payment]),
  ],
  providers: [MembershipService, MembersService, GoldMembershipService],
  exports: [MembershipService, MembersService, GoldMembershipService],
})
export class MembersModule {}
