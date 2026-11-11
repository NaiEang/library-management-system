import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Book } from '../books/entities/book.entity';
import { BookCopy } from '../books/entities/book-copy.entity';
import { LoanItem } from '../loans/entities/loan-item.entity';
import { COPY_CODE_PREFIX, MANUAL_COPY_STATUSES } from './book-copy.constants';
import { CreateBookCopiesDto } from './dto/create-book-copies.dto';
import { UpdateBookCopyDto } from './dto/update-book-copy.dto';

@Injectable()
export class BookCopiesService {
  constructor(
    @InjectRepository(BookCopy) private readonly copyRepo: Repository<BookCopy>,
    @InjectRepository(Book) private readonly bookRepo: Repository<Book>,
    @InjectRepository(LoanItem) private readonly loanItemRepo: Repository<LoanItem>,
  ) {}

  async createForBook(bookId: string, dto: CreateBookCopiesDto) {
    await this.assertBookExists(bookId);
    const quantity = dto.quantity ?? 1;
    // Insert with a temporary unique code, then set the real code from each row id.
    // Row ids come from the database sequence, so the barcodes can never collide.
    return this.copyRepo.manager.transaction(async (manager) => {
      const drafts = Array.from({ length: quantity }, () =>
        manager.create(BookCopy, {
          bookId,
          copyCode: `TMP-${randomUUID()}`,
          condition: dto.condition ?? 'new',
          status: 'available',
          location: dto.location,
        }),
      );
      const saved = await manager.save(BookCopy, drafts);
      for (const copy of saved) copy.copyCode = this.codeFor(copy.id);
      return manager.save(BookCopy, saved);
    });
  }

  async listForBook(bookId: string, status?: string) {
    await this.assertBookExists(bookId);
    return this.copyRepo.find({
      where: { bookId, ...(status ? { status } : {}) },
      order: { id: 'ASC' },
    });
  }

  async findOne(id: string) {
    const copy = await this.copyRepo.findOne({ where: { id }, relations: { book: true } });
    if (!copy) throw new NotFoundException(`Copy ${id} not found`);
    return copy;
  }

  async findByCode(copyCode: string) {
    const copy = await this.copyRepo.findOne({ where: { copyCode }, relations: { book: true } });
    if (!copy) throw new NotFoundException(`Copy with code ${copyCode} not found`);
    return copy;
  }

  async update(id: string, dto: UpdateBookCopyDto) {
    const copy = await this.getOrFail(id);
    if (!MANUAL_COPY_STATUSES.includes(copy.status)) {
      throw new ConflictException(
        `This copy is currently "${copy.status}". Change it through the borrowing process, not here.`,
      );
    }
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    Object.assign(copy, changes);
    await this.copyRepo.save(copy);
    return this.findOne(id);
  }

  async remove(id: string) {
    const copy = await this.getOrFail(id);
    const loanCount = await this.loanItemRepo.count({ where: { bookCopy: { id } } });
    if (loanCount > 0) {
      throw new ConflictException(
        'Cannot delete: this copy has borrowing history. Mark it as lost or damaged instead.',
      );
    }
    await this.copyRepo.remove(copy);
    return { deleted: true };
  }

  private codeFor(id: string) {
    return `${COPY_CODE_PREFIX}${id.padStart(6, '0')}`;
  }

  private async getOrFail(id: string) {
    const copy = await this.copyRepo.findOne({ where: { id } });
    if (!copy) throw new NotFoundException(`Copy ${id} not found`);
    return copy;
  }
  
  private async assertBookExists(bookId: string) {
    const exists = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!exists) throw new NotFoundException(`Book ${bookId} not found`);
  }
}