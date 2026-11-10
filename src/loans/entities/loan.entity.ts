import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, type Relation } from 'typeorm';
import { Member } from '../../members/entities/member.entity';
import { LoanItem } from './loan-item.entity';

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'member_id', type: 'bigint' })
  memberId: string;

  @Column({ name: 'loan_code', type: 'varchar', nullable: true })
  loanCode: string;

  @Column({ name: 'loan_date', type: 'timestamp', nullable: true })
  loanDate: Date;

  @Column({ type: 'varchar' })
  status: string; // LoanStatus (common/constants): pending, active, completed, rejected

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Member, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'member_id' })
  member: Relation<Member>;

  @OneToMany(() => LoanItem, (loanItem) => loanItem.loan)
  loanItems: Relation<LoanItem[]>;
}