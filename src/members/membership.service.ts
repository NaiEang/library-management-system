import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
import {
  MembershipStatus,
  MembershipTier,
  UserStatus,
} from '../common/constants';
import { Member } from './entities/member.entity';
import { libraryToday, tierOf } from './library-date';

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
    const member = await this.load(memberId);
    return member !== null && this.isInGoodStanding(member, this.today());
  }

  // Gold = in good standing (everything canBorrow() requires) AND the paid gold
  // period hasn't ended (gold_until >= the library's today). Gold that ran out
  // simply counts as standard: nothing to reset, and buying gold again
  // (POST /users/:id/gold-membership) makes the member gold again. Always read
  // from the database, never from the token.
  async isGold(memberId: string): Promise<boolean> {
    const member = await this.load(memberId);
    if (!member) {
      return false;
    }
    const today = this.today();
    return (
      this.isInGoodStanding(member, today) &&
      tierOf(member.goldUntil, today) === MembershipTier.GOLD
    );
  }

  private today(): string {
    return libraryToday(this.config.libraryTimeZone);
  }

  private async load(memberId: string): Promise<Member | null> {
    if (!/^\d+$/.test(memberId)) {
      return null;
    }
    return this.members.findOne({
      where: { id: memberId },
      relations: { user: true },
      select: {
        id: true,
        membershipStatus: true,
        expiryDate: true,
        goldUntil: true,
        user: { id: true, status: true },
      },
    });
  }

  private isInGoodStanding(member: Member, today: string): boolean {
    if (!member.user) {
      return false;
    }
    return (
      member.user.status === UserStatus.ACTIVE &&
      member.membershipStatus === MembershipStatus.ACTIVE &&
      // An active membership without an expiry date is bad data: fail closed.
      member.expiryDate !== null &&
      // Both are YYYY-MM-DD strings, so string order is date order.
      member.expiryDate >= today
    );
  }
}
