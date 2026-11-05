import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Author } from '../books/entities/author.entity';
import { BookAuthor } from '../books/entities/book-author.entity';
import { CreateAuthorDto } from './dto/create-author.dto';
import { UpdateAuthorDto } from './dto/update-author.dto';
@Injectable()
export class AuthorsService {
  constructor(
    @InjectRepository(Author)
    private readonly authorRepo: Repository<Author>,
    @InjectRepository(BookAuthor)
    private readonly bookAuthorRepo: Repository<BookAuthor>,
  ) {}
  create(dto: CreateAuthorDto) {
    return this.authorRepo.save(this.authorRepo.create(dto));
  }
  findAll(search?: string) {
    return this.authorRepo.find({
      where: search ? { name: ILike(`%${search}%`) } : {},
      order: { name: 'ASC' },
    });
  }
  async findOne(id: number) {
    const author = await this.authorRepo.findOne({ where: { id } });
    if (!author) throw new NotFoundException(`Author ${id} not found`);
    return author;
  }
  async update(id: number, dto: UpdateAuthorDto) {
    const author = await this.findOne(id);
    Object.assign(author, dto);
    return this.authorRepo.save(author);
  }
  async remove(id: number) {
    const author = await this.findOne(id);
    const bookCount = await this.bookAuthorRepo.count({ where: { authorId: id } });
    if (bookCount > 0) {
      throw new ConflictException(
        `Cannot delete: author is linked to ${bookCount} book(s)`,
      );
    }
    await this.authorRepo.remove(author);
    return { deleted: true };
  }
}