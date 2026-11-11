// src/books/entities/book.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { BookCopy } from './book-copy.entity';
import { BookAuthor } from './book-author.entity';

@Entity('books')
export class Book {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'category_id', type: 'integer', nullable: true })
  categoryId: number | null;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  isbn: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  publisher: string;

  @Column({ name: 'published_date', type: 'date', nullable: true })
  publishedDate: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'English' })
  language: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Category, (category) => category.books, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => BookAuthor, (ba) => ba.book)
  bookAuthors: BookAuthor[];

  @OneToMany(() => BookCopy, (copy) => copy.book)
  copies: BookCopy[];
}
