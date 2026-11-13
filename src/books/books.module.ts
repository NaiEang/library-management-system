import { Module } from '@nestjs/common';
import { BooksService } from './books.service';
import { BooksCatalogService } from './books-catalog.service';
import { BooksController } from './books.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookAuthor } from './entities/book-author.entity';
import { BookCopy } from './entities/book-copy.entity';
import { Category } from './entities/category.entity';
import { Author } from './entities/author.entity';
import { Book } from './entities/book.entity';
@Module({
  controllers: [BooksController],
  providers: [BooksService, BooksCatalogService],
  imports: [TypeOrmModule.forFeature([Book, Author, Category, BookCopy, BookAuthor])],
})
export class BooksModule {}