import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Author } from './entities/author.entity';
import { Book } from './entities/book.entity';
import { BookAuthor } from './entities/book-author.entity';
import { BookCopy } from './entities/book-copy.entity';
import { Category } from './entities/category.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Book) private readonly bookRepo: Repository<Book>,
    @InjectRepository(Author) private readonly authorRepo: Repository<Author>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(BookCopy) private readonly copyRepo: Repository<BookCopy>,
  ) {}
  async create(dto: CreateBookDto) {
    const { authorIds, categoryId, ...fields } = dto;
    await this.assertIsbnFree(fields.isbn);
    await this.assertCategoryExists(categoryId);
    await this.assertAuthorsExist(authorIds);
    const bookId = await this.bookRepo.manager.transaction(async (manager) => {
      const book = await manager.save(
        Book,
        manager.create(Book, { ...fields, categoryId: categoryId ?? null }),
      );
      await manager.save(
        BookAuthor,
        authorIds.map((authorId) =>
          manager.create(BookAuthor, { bookId: book.id, authorId }),
        ),
      );
      return book.id;
    });
    return this.findOne(bookId);
  }
  // Temporary simple list. It will be replaced by full-text search + cursor pagination.
  async findAll() {
    const books = await this.bookRepo.find({
      relations: { category: true, bookAuthors: { author: true } },
      order: { id: 'DESC' },
      take: 50,
    });
    return books.map((book) => this.toResponse(book));
  }
  async findOne(id: string) {
    const book = await this.bookRepo.findOne({
      where: { id },
      relations: { category: true, bookAuthors: { author: true } },
    });
    if (!book) throw new NotFoundException(`Book ${id} not found`);
    const [total, available] = await Promise.all([
      this.copyRepo.count({ where: { bookId: id } }),
      this.copyRepo.count({ where: { bookId: id, status: 'available' } }),
    ]);
    return this.toResponse(book, { total, available });
  }
  async update(id: string, dto: UpdateBookDto) {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException(`Book ${id} not found`);
    const { authorIds, categoryId, ...fields } = dto;
    if (fields.isbn && fields.isbn !== book.isbn)
      await this.assertIsbnFree(fields.isbn);
    if (categoryId !== undefined) await this.assertCategoryExists(categoryId);
    if (authorIds !== undefined) await this.assertAuthorsExist(authorIds);
    await this.bookRepo.manager.transaction(async (manager) => {
      Object.assign(book, fields);
      if (categoryId !== undefined) book.categoryId = categoryId;
      await manager.save(Book, book);
      if (authorIds !== undefined) {
        await manager.delete(BookAuthor, { bookId: id });
        await manager.save(
          BookAuthor,
          authorIds.map((authorId) =>
            manager.create(BookAuthor, { bookId: id, authorId }),
          ),
        );
      }
    });
    return this.findOne(id);
  }
  async remove(id: string) {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new NotFoundException(`Book ${id} not found`);
    const copies = await this.copyRepo.count({ where: { bookId: id } });
    if (copies > 0) {
      throw new ConflictException(
        `Cannot delete: this book still has ${copies} copy(ies). Remove the copies first.`,
      );
    }
    await this.bookRepo.manager.transaction(async (manager) => {
      await manager.delete(BookAuthor, { bookId: id });
      await manager.delete(Book, { id });
    });
    return { deleted: true };
  }
  private toResponse(
    book: Book,
    copies?: { total: number; available: number },
  ) {
    const { bookAuthors, ...rest } = book;
    return {
      ...rest,
      authors: (bookAuthors ?? []).map((ba) => ({
        id: ba.author.id,
        name: ba.author.name,
      })),
      ...(copies ? { copies } : {}),
    };
  }
  private async assertIsbnFree(isbn?: string) {
    if (!isbn) return;
    const exists = await this.bookRepo.findOne({ where: { isbn } });
    if (exists)
      throw new ConflictException('A book with this ISBN already exists');
  }
  private async assertCategoryExists(categoryId?: number | null) {
    if (categoryId === undefined || categoryId === null) return;
    const exists = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });
    if (!exists)
      throw new BadRequestException(`Category ${categoryId} does not exist`);
  }
  private async assertAuthorsExist(authorIds: number[]) {
    const found = await this.authorRepo.count({ where: { id: In(authorIds) } });
    if (found !== authorIds.length) {
      throw new BadRequestException('One or more authorIds do not exist');
    }
  }
}
