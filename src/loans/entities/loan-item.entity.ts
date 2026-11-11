import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, type Relation } from 'typeorm';
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

  @Column({ name: 'borrowed_at', type: 'timestamp', nullable: true })
  borrowedAt: Date | null;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'returned_at', type: 'timestamp', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'varchar' })
  status: string; // LoanItemStatus (common/constants): requested, borrowed, overdue, returned

  @Column({ name: 'fine_amount', type: 'numeric', precision: 10, scale: 2, default: 0 })
  fineAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Loan, (loan) => loan.loanItems, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loan_id' })
  loan: Relation<Loan>;

  @ManyToOne(() => BookCopy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'book_copy_id' })
  bookCopy: Relation<BookCopy>;
}