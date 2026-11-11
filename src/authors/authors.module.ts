import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Author } from '../books/entities/author.entity';
import { BookAuthor } from '../books/entities/book-author.entity';
import { AuthorsController } from './authors.controller';
import { AuthorsService } from './authors.service';
@Module({
  imports: [TypeOrmModule.forFeature([Author, BookAuthor])],
  controllers: [AuthorsController],
  providers: [AuthorsService],
  exports: [AuthorsService],
})
export class AuthorsModule {}