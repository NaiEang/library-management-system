import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Member } from '../members/entities/member.entity';
import { MembershipService } from '../members/membership.service';

export interface EligibilityResult {
  email: string;
  isRegistered: boolean;
  canBookSpace: boolean;
  reason: string | null;
}

@Injectable()
export class ExternalService {
  constructor(
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    private readonly membership: MembershipService,
  ) {}

  async checkEligibility(email: string): Promise<EligibilityResult> {
    const member = await this.members.findOne({
      where: { user: { email: email.toLowerCase().trim() } },
      relations: { user: true },
    });

    if (!member) {
      return { email, isRegistered: false, canBookSpace: false, reason: 'Not a library member' };
    }

    const now = new Date();
    if (member.blockedUntil && member.blockedUntil > now) {
      return { email, isRegistered: true, canBookSpace: false, reason: 'Account blocked due to overdue books' };
    }

    const eligible = await this.membership.canBorrow(member.id);
    if (!eligible) {
      return { email, isRegistered: true, canBookSpace: false, reason: 'Membership not active' };
    }

    return { email, isRegistered: true, canBookSpace: true, reason: null };
  }
}
