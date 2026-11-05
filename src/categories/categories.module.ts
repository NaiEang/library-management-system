import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../books/entities/category.entity';
import { Book } from '../books/entities/book.entity';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
@Module({
  imports: [TypeOrmModule.forFeature([Category, Book])],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}