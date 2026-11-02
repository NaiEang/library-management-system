import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Loan } from '../../loans/entities/loan.entity';
import { Payment } from '../../payments/entities/payment.entity';

@Entity('members')
export class Member {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  @Column({ name: 'member_code', type: 'varchar', length: 50, unique: true })
  memberCode: string;

  @Column({ name: 'membership_date', type: 'date', default: () => 'CURRENT_DATE' })
  membershipDate: string;

  @Column({ name: 'expiry_date', type: 'date' })
  expiryDate: string;

  @Column({ name: 'membership_status', type: 'varchar', length: 20, default: 'active' })
  membershipStatus: string;

  @Column({ name: 'deposit_amount', type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  depositAmount: number;

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