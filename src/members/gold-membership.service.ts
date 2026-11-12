import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { authConfig } from '../auth/config/auth.config';
import {
  MembershipStatus,
  MembershipTier,
  UserStatus,
} from '../common/constants';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { uniqueViolationColumn } from '../users/users.service';
import { Member } from './entities/member.entity';
import { addDays, addYears, libraryToday } from './library-date';
import { generateGoldPaymentCode } from './member-code';
import { EMAIL_NOT_VERIFIED } from './members.service';

// payments.payment_type for the gold fee (next to 'deposit' and 'fine').
export const GOLD_PAYMENT_TYPE = 'gold_membership';
// A gold member can renew only in the last 30 days (or after it ended). This
// also stops a double click from charging twice.
export const GOLD_RENEWAL_WINDOW_DAYS = 30;

export enum GoldPaymentMethod {
  CASH = 'cash',
  KHQR = 'khqr',
}

export interface GoldMembershipResponse {
  userId: string;
  memberId: string;
  memberCode: string;
  tier: MembershipTier.GOLD;
  // Last day of gold (library date).
  goldUntil: string;
  // true when an existing gold period was extended.
  renewed: boolean;
  payment: {
    paymentCode: string;
    amount: number;
    paymentMethod: GoldPaymentMethod;
    paymentType: typeof GOLD_PAYMENT_TYPE;
  };
}

const PAYMENT_CODE_ATTEMPTS = 3;

// Gold is bought at the desk: the staff member takes the fee, and this records
// it. Only this module writes members.gold_until.
@Injectable()
export class GoldMembershipService {
  constructor(
    @InjectRepository(Member)
    private readonly members: Repository<Member>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  // Upgrades a standard member, or renews a gold one for one more year.
  // :userId is the member's USER id, like verify-deposit.
  async buyGold(
    userId: string,
    paymentMethod: GoldPaymentMethod,
  ): Promise<GoldMembershipResponse> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.members.manager.transaction((manager) =>
          this.buyGoldIn(manager, userId, paymentMethod),
        );
      } catch (error) {
        // A random payment code collided: the whole transaction rolled back,
        // so nothing was charged; try again with a new code.
        if (
          uniqueViolationColumn(error) === 'payment_code' &&
          attempt < PAYMENT_CODE_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  // One transaction with the member row locked: two staff members clicking
  // at once can't both charge, and the payment and the new date are saved
  // together or not at all.
  private async buyGoldIn(
    manager: EntityManager,
    userId: string,
    paymentMethod: GoldPaymentMethod,
  ): Promise<GoldMembershipResponse> {
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

    const today = libraryToday(this.config.libraryTimeZone);
    this.checkEligible(member, user, today);

    const stillGold = member.goldUntil !== null && member.goldUntil >= today;
    if (
      stillGold &&
      member.goldUntil! > addDays(today, GOLD_RENEWAL_WINDOW_DAYS)
    ) {
      throw new ConflictException(
        `Already gold until ${member.goldUntil}; renewal opens ${GOLD_RENEWAL_WINDOW_DAYS} days before it ends`,
      );
    }
    // Renewing extends from the current end, so no paid day is lost.
    const goldUntil = addYears(stillGold ? member.goldUntil! : today, 1);

    // Second safety net next to the lock: only the row we checked changes.
    const { affected } = await manager.update(
      Member,
      {
        id: member.id,
        goldUntil: member.goldUntil === null ? IsNull() : member.goldUntil,
      },
      { goldUntil },
    );
    if (affected !== 1) {
      throw new ConflictException(
        'The gold membership changed in the meantime; reload and try again',
      );
    }

    const paymentCode = generateGoldPaymentCode(today.slice(0, 4));
    const amount = this.config.goldMembershipFee;
    await manager.insert(Payment, {
      memberId: member.id,
      paymentCode,
      amount,
      paymentMethod,
      paymentType: GOLD_PAYMENT_TYPE,
      status: 'completed',
      notes: `Gold membership until ${goldUntil}`,
    });

    return {
      userId,
      memberId: member.id,
      memberCode: member.memberCode,
      tier: MembershipTier.GOLD,
      goldUntil,
      renewed: stillGold,
      payment: {
        paymentCode,
        amount,
        paymentMethod,
        paymentType: GOLD_PAYMENT_TYPE,
      },
    };
  }

  // Gold sits on top of a valid standard membership: account enabled, deposit
  // verified and still held, membership not expired, email verified.
  private checkEligible(member: Member, user: User, today: string): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ConflictException('This account is disabled');
    }
    if (member.membershipStatus !== MembershipStatus.ACTIVE) {
      throw new ConflictException(
        'Only active members can buy gold: verify the deposit first',
      );
    }
    if (member.expiryDate === null || member.expiryDate < today) {
      throw new ConflictException('The membership has expired');
    }
    // Postgres decimals arrive as strings.
    if (!(Number(member.depositAmount) > 0)) {
      throw new ConflictException('No deposit is held for this member');
    }
    if (!user.emailVerifiedAt) {
      throw new ConflictException(EMAIL_NOT_VERIFIED);
    }
  }
}
