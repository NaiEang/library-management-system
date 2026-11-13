import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
import {
  MembershipStatus,
  MembershipTier,
  UserStatus,
} from '../common/constants';
import { User } from '../users/entities/user.entity';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { Member } from './entities/member.entity';
import { addYears, libraryToday, tierOf } from './library-date';

// One row of the librarian's member list. blocked_until is deliberately absent:
// "blocked" belongs to Circulation.
export interface MemberListItem {
  userId: string;
  memberId: string;
  memberCode: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  accountStatus: UserStatus;
  // The librarian checks this at the desk: no deposit before it's true.
  emailVerified: boolean;
  membershipStatus: MembershipStatus;
  depositAmount: number;
  depositVerifiedAt: Date | null;
  expiryDate: string | null;
  // 'gold' while goldUntil hasn't passed, worked out from the date alone (for
  // display; the access check for gold features is MembershipService.isGold()).
  tier: MembershipTier;
  // Last day of the paid gold period (library date); null = never gold.
  goldUntil: string | null;
}

export interface MemberListPage {
  data: MemberListItem[];
  meta: { page: number; limit: number; total: number };
}

export const EMAIL_NOT_VERIFIED =
  "The member's email is not verified yet: ask them to enter the code from their email first";

// Escapes LIKE wildcards, so a search for "50%" or "a_b" matches literally.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async list(query: ListMembersQueryDto): Promise<MemberListPage> {
    const today = libraryToday(this.config.libraryTimeZone);
    const builder = this.members
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.user', 'user')
      .orderBy('member.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.membershipStatus) {
      builder.andWhere('member.membershipStatus = :status', {
        status: query.membershipStatus,
      });
    }
    if (query.emailVerified !== undefined) {
      builder.andWhere(
        query.emailVerified
          ? 'user.emailVerifiedAt IS NOT NULL'
          : 'user.emailVerifiedAt IS NULL',
      );
    }
    if (query.tier === MembershipTier.GOLD) {
      builder.andWhere('member.goldUntil >= :today', { today });
    } else if (query.tier === MembershipTier.STANDARD) {
      builder.andWhere(
        '(member.goldUntil IS NULL OR member.goldUntil < :today)',
        { today },
      );
    }
    if (query.search) {
      builder.andWhere(
        "(user.email ILIKE :search ESCAPE '\\' OR user.username ILIKE :search ESCAPE '\\' OR member.memberCode ILIKE :search ESCAPE '\\')",
        { search: `%${escapeLike(query.search)}%` },
      );
    }

    const [rows, total] = await builder.getManyAndCount();
    return {
      data: rows.map((row) => toMemberListItem(row, today)),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  // The librarian took the deposit at the desk. :id is the member's USER id.
  // One transaction with the member row locked, so two staff clicking at the
  // same time can't both verify it.
  async verifyDeposit(
    userId: string,
    verifiedBy: string,
  ): Promise<MemberListItem> {
    return this.members.manager.transaction(async (manager) => {
      const member = await manager
        .createQueryBuilder(Member, 'member')
        .setLock('pessimistic_write')
        .where('member.userId = :userId', { userId })
        .getOne();
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('Member not found');
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw new ConflictException('This account is disabled');
      }
      if (member.membershipStatus !== MembershipStatus.PENDING_DEPOSIT) {
        throw new ConflictException(
          'The deposit was already verified for this member',
        );
      }
      // The member proves the email is theirs before paying, so the library
      // (and Space Booking) can trust it.
      if (!user.emailVerifiedAt) {
        throw new ConflictException(EMAIL_NOT_VERIFIED);
      }

      const today = libraryToday(this.config.libraryTimeZone);
      member.depositAmount = this.config.depositAmount;
      member.membershipStatus = MembershipStatus.ACTIVE;
      member.depositVerifiedAt = new Date();
      member.depositVerifiedBy = verifiedBy;
      member.expiryDate = addYears(today, 1);
      // Second safety net next to the lock: only a still-pending row changes.
      const { affected } = await manager.update(
        Member,
        { id: member.id, membershipStatus: MembershipStatus.PENDING_DEPOSIT },
        {
          depositAmount: member.depositAmount,
          membershipStatus: member.membershipStatus,
          depositVerifiedAt: member.depositVerifiedAt,
          depositVerifiedBy: member.depositVerifiedBy,
          expiryDate: member.expiryDate,
        },
      );
      if (affected !== 1) {
        throw new ConflictException(
          'The deposit was already verified for this member',
        );
      }

      member.user = user;
      return toMemberListItem(member, today);
    });
  }
}

function toMemberListItem(member: Member, today: string): MemberListItem {
  return {
    userId: member.user.id,
    memberId: member.id,
    memberCode: member.memberCode,
    email: member.user.email,
    username: member.user.username,
    firstName: member.user.firstName ?? null,
    lastName: member.user.lastName ?? null,
    accountStatus: member.user.status,
    emailVerified: member.user.emailVerifiedAt != null,
    membershipStatus: member.membershipStatus,
    // Postgres decimals arrive as strings.
    depositAmount: Number(member.depositAmount),
    depositVerifiedAt: member.depositVerifiedAt ?? null,
    expiryDate: member.expiryDate ?? null,
    tier: tierOf(member.goldUntil ?? null, today),
    goldUntil: member.goldUntil ?? null,
  };
}
