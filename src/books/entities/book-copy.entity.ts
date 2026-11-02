import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Book } from './book.entity';
import { LoanItem } from '../../loans/entities/loan-item.entity';

@Entity('book_copies')
export class BookCopy {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'book_id', type: 'bigint' })
  bookId: string;

  @Column({ name: 'copy_code', type: 'varchar', length: 50, unique: true })
  copyCode: string;

  @Column({ type: 'varchar', length: 30, default: 'new' })
  condition: string;

  @Column({ type: 'varchar', length: 30, default: 'available' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Book, (book) => book.copies)
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @OneToMany(() => LoanItem, (item) => item.bookCopy)
  loanItems: LoanItem[];
}