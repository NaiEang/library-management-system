import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Member } from '../../members/entities/member.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'member_id', type: 'bigint' })
  memberId: string;

  @Column({ name: 'payment_code', type: 'varchar', length: 50, unique: true })
  paymentCode: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 30 })
  paymentMethod: string; // e.g., 'cash', 'khqr'

  @Column({ name: 'payment_type', type: 'varchar', length: 30 })
  paymentType: string; // e.g., 'deposit', 'fine'

  @Column({ name: 'payment_date', type: 'timestamp', default: () => 'NOW()' })
  paymentDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: string;

  @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true })
  referenceNumber: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Member, (member) => member.payments)
  @JoinColumn({ name: 'member_id' })
  member: Member;
}