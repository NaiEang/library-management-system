import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Member } from '../../members/entities/member.entity';
import { LoanItem } from './loan-item.entity';

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'member_id', type: 'bigint' })
  memberId: string;

  @Column({ name: 'loan_code', type: 'varchar', length: 50, unique: true })
  loanCode: string;

  @Column({ name: 'loan_date', type: 'timestamp', default: () => 'NOW()' })
  loanDate: Date;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Member, (member) => member.loans)
  @JoinColumn({ name: 'member_id' })
  member: Member;

  @OneToMany(() => LoanItem, (item) => item.loan, { cascade: true })
  items: LoanItem[];
}