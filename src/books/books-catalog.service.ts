import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Book } from './entities/book.entity';
import { ListBooksQueryDto } from './dto/list-books-query.dto';
interface Cursor {
  id: string;
  r?: string;
}
interface IdRow {
  id: string;
  rank?: string;
}
interface CountRow {
  bookId: string;
  total: number;
  available: number;
}
const MAX_SEARCH_WORDS = 8;
@Injectable()
export class BooksCatalogService {
  constructor(@InjectRepository(Book) private readonly bookRepo: Repository<Book>) {}
  async list(query: ListBooksQueryDto) {
    const limit = query.limit ?? 20;
    const searching = query.q !== undefined && query.q.trim() !== '';
    const words = this.tokenize(query.q);
    const cursor = this.decodeCursor(query.cursor, searching);
    // The user typed something, but nothing in it can be searched (for example "!!!").
    if (searching && words.length === 0) {
      return { data: [], nextCursor: null, hasMore: false };
    }
    const rows = searching
      ? await this.searchIds(words, query.categoryId, query.itemType, cursor, limit + 1)
      : await this.listIds(query.categoryId, query.itemType, cursor, limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = await this.hydrate(page.map((row) => row.id));
    const last = page[page.length - 1];
    return {
      data,
      hasMore,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }
  // Newest first. The cursor is simply the id of the last book on the previous page.
  private async listIds(
    categoryId: number | undefined,
    itemType: string | undefined,
    cursor: Cursor | null,
    take: number,
  ): Promise<IdRow[]> {
    const rows = await this.bookRepo.find({
      select: { id: true },
      where: {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(itemType !== undefined ? { itemType } : {}),
        ...(cursor ? { id: LessThan(cursor.id) } : {}),
      },
      order: { id: 'DESC' },
      take,
    });
    return rows.map((row) => ({ id: row.id }));
  }
  // PostgreSQL full-text search. Best match first; ties are broken by id.
  // The cursor is (rank, id) of the last book on the previous page.
  private async searchIds(
    words: string[],
    categoryId: number | undefined,
    itemType: string | undefined,
    cursor: Cursor | null,
    take: number,
  ): Promise<IdRow[]> {
    const params: unknown[] = [words.map((word) => `${word}:*`).join(' & ')];
    let categoryFilter = '';
    if (categoryId !== undefined) {
      params.push(categoryId);
      categoryFilter = `AND b.category_id = $${params.length}`;
    }
    let itemTypeFilter = '';
    if (itemType !== undefined) {
      params.push(itemType);
      itemTypeFilter = `AND b.item_type = $${params.length}`;
    }
    let cursorFilter = '';
    if (cursor) {
      params.push(cursor.r);
      const rankParam = params.length;
      params.push(cursor.id);
      const idParam = params.length;
      cursorFilter = `WHERE (s.rank < $${rankParam}::numeric
        OR (s.rank = $${rankParam}::numeric AND s.id < $${idParam}::bigint))`;
    }
    params.push(take);
    const sql = `
      SELECT s.id::text AS id, s.rank::text AS rank
      FROM (
        SELECT b.id, ROUND(ts_rank(doc.vec, q.query)::numeric, 4) AS rank
        FROM books b
        LEFT JOIN categories c ON c.id = b.category_id
        CROSS JOIN LATERAL (
          SELECT
            setweight(to_tsvector('simple', coalesce(b.title, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce((
              SELECT string_agg(a.name, ' ')
              FROM book_authors ba
              JOIN authors a ON a.id = ba.author_id
              WHERE ba.book_id = b.id
            ), '')), 'B') ||
            setweight(to_tsvector('simple', coalesce(c.name, '')), 'C') AS vec
        ) doc
        CROSS JOIN (SELECT to_tsquery('simple', $1) AS query) q
        WHERE doc.vec @@ q.query ${categoryFilter} ${itemTypeFilter}
      ) s
      ${cursorFilter}
      ORDER BY s.rank DESC, s.id DESC
      LIMIT $${params.length}`;
    return (await this.bookRepo.query(sql, params)) as IdRow[];
  }
  // Loads the books for one page, with authors, category and copy counts, in two queries.
  private async hydrate(ids: string[]) {
    if (ids.length === 0) return [];
    const [books, counts] = await Promise.all([
      this.bookRepo.find({
        where: { id: In(ids) },
        relations: { category: true, bookAuthors: { author: true } },
      }),
      this.bookRepo.query(
        `SELECT book_id::text AS "bookId",
                COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE status = 'available'))::int AS available
         FROM book_copies
         WHERE book_id = ANY($1::bigint[])
         GROUP BY book_id`,
        [ids],
      ) as Promise<CountRow[]>,
    ]);
    const booksById = new Map(books.map((book) => [book.id, book]));
    const countsById = new Map(counts.map((row) => [row.bookId, row]));
    return ids
      .map((id) => booksById.get(id))
      .filter((book): book is Book => book !== undefined)
      .map((book) => {
        const { bookAuthors, ...rest } = book;
        const count = countsById.get(book.id);
        return {
          ...rest,
          authors: (bookAuthors ?? []).map((ba) => ({ id: ba.author.id, name: ba.author.name })),
          copies: { total: count?.total ?? 0, available: count?.available ?? 0 },
        };
      });
  }
  // Keeps only letters and digits, so user input can never break the tsquery.
  private tokenize(q?: string): string[] {
    if (!q) return [];
    const words = q.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
    return [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
  }
  private encodeCursor(row: IdRow): string {
    const payload: Cursor = row.rank !== undefined ? { id: row.id, r: row.rank } : { id: row.id };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }
  private decodeCursor(raw: string | undefined, searching: boolean): Cursor | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
      const idOk = typeof parsed.id === 'string' && /^\d+$/.test(parsed.id);
      const rankOk = searching
        ? typeof parsed.r === 'string' && /^\d+(\.\d+)?$/.test(parsed.r)
        : parsed.r === undefined;
      if (idOk && rankOk) return parsed;
    } catch {
      // fall through to the error below
    }
    throw new BadRequestException('Invalid cursor');
  }
}