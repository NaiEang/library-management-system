import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Check,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Loan } from '../../loans/entities/loan.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { MembershipStatus } from '../../common/constants';

// Loans and payments read this entity: keep existing fields and relations as
// they are. New columns are additive.
@Entity('members')
// The original checks from the team's schema (InitialSchema dropped them
// by accident), restored with their original names.
@Check('chk_members_deposit_nonnegative', `"deposit_amount" >= 0`)
@Check(
  'chk_membership_date_range',
  `"expiry_date" IS NULL OR "expiry_date" >= "membership_date"`,
)
@Check(
  'CHK_members_membership_status',
  `"membership_status" IN ('pending_deposit', 'active', 'expired')`,
)
export class Member {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  @Column({ name: 'member_code', type: 'varchar', length: 50, unique: true })
  memberCode: string;

  @Column({
    name: 'membership_date',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  membershipDate: string;

  // Null until the deposit is verified.
  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({
    name: 'membership_status',
    type: 'varchar',
    length: 20,
    default: MembershipStatus.PENDING_DEPOSIT,
  })
  membershipStatus: MembershipStatus;

  @Column({
    name: 'deposit_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
  })
  depositAmount: number;

  @Column({ name: 'deposit_verified_at', type: 'timestamptz', nullable: true })
  depositVerifiedAt: Date | null;

  // The librarian or admin who took the deposit.
  @Column({ name: 'deposit_verified_by', type: 'bigint', nullable: true })
  depositVerifiedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'deposit_verified_by' })
  depositVerifiedByUser: Relation<User> | null;

  // Late-return penalty, written by Circulation (Naieang). The Auth & Users
  // module never writes it and never returns it.
  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.member)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Loan, (loan) => loan.member)
  loans: Loan[];

  @OneToMany(() => Payment, (payment) => payment.member)
  payments: Payment[];
}
