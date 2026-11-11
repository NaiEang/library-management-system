import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book } from '../books/entities/book.entity';
import { BookCopy } from '../books/entities/book-copy.entity';
import { LoanItem } from '../loans/entities/loan-item.entity';
import { BookCopiesController } from './book-copies.controller';
import { BookCopiesService } from './book-copies.service';

@Module({
  imports: [TypeOrmModule.forFeature([BookCopy, Book, LoanItem])],
  controllers: [BookCopiesController],
  providers: [BookCopiesService],
  exports: [BookCopiesService],
})

export class BookCopiesModule {}