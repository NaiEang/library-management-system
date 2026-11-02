import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Loan } from './loan.entity';
import { BookCopy } from '../../books/entities/book-copy.entity';

@Entity('loan_items')
export class LoanItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'loan_id', type: 'bigint' })
  loanId: string;

  @Column({ name: 'book_copy_id', type: 'bigint' })
  bookCopyId: string;

  @Column({ name: 'borrowed_at', type: 'timestamp', default: () => 'NOW()' })
  borrowedAt: Date;

  @Column({ name: 'due_date', type: 'timestamp' })
  dueDate: Date;

  @Column({ name: 'returned_at', type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'borrowed' })
  status: string;

  @Column({ name: 'fine_amount', type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  fineAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Loan, (loan) => loan.items)
  @JoinColumn({ name: 'loan_id' })
  loan: Loan;

  @ManyToOne(() => BookCopy, (copy) => copy.loanItems)
  @JoinColumn({ name: 'book_copy_id' })
  bookCopy: BookCopy;
}