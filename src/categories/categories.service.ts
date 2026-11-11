import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../books/entities/category.entity';
import { Book } from '../books/entities/book.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
  ) {}

  async create(dto: CreateCategoryDto) {
    await this.ensureNameIsFree(dto.name);
    return this.categoryRepo.save(this.categoryRepo.create(dto));
  }

  findAll() {
    return this.categoryRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    if (dto.name && dto.name !== category.name) {
      await this.ensureNameIsFree(dto.name);
    }
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async remove(id: number) {
    const category = await this.findOne(id);
    const bookCount = await this.bookRepo.count({ where: { categoryId: id } });
    if (bookCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${bookCount} book(s) still use this category`,
      );
    }
    await this.categoryRepo.remove(category);
    return { deleted: true };
  }

  private async ensureNameIsFree(name: string) {
    const exists = await this.categoryRepo.findOne({ where: { name } });
    if (exists) throw new ConflictException('Category name already exists');
  }
}
