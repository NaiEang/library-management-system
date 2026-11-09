import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
import { MembershipStatus, UserStatus } from '../common/constants';
import { Member } from './entities/member.entity';
import { libraryToday } from './library-date';

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  // The account and membership side of "may this member borrow?": account
  // active, membership active, not expired (by the library's date). It does
  // NOT check "blocked" (an overdue book or blocked_until); Circulation adds
  // that check on top. The future /external eligibility endpoint reuses this.
  async canBorrow(memberId: string): Promise<boolean> {
    if (!/^\d+$/.test(memberId)) {
      return false;
    }
    const member = await this.members.findOne({
      where: { id: memberId },
      relations: { user: true },
      select: {
        id: true,
        membershipStatus: true,
        expiryDate: true,
        user: { id: true, status: true },
      },
    });
    if (!member?.user) {
      return false;
    }
    return (
      member.user.status === UserStatus.ACTIVE &&
      member.membershipStatus === MembershipStatus.ACTIVE &&
      // An active membership without an expiry date is bad data: fail closed.
      member.expiryDate !== null &&
      // Both are YYYY-MM-DD strings, so string order is date order.
      member.expiryDate >= libraryToday(this.config.libraryTimeZone)
    );
  }
}
