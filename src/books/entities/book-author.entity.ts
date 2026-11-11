import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import { Book } from './book.entity';
import { Author } from './author.entity';

@Entity('book_authors')
export class BookAuthor {
  @PrimaryColumn({ name: 'book_id', type: 'bigint' })
  bookId: string;

  @PrimaryColumn({ name: 'author_id', type: 'integer' })
  authorId: number;

  @ManyToOne(() => Book, (book) => book.bookAuthors)
  @JoinColumn({ name: 'book_id' })
  book: Relation<Book>;

  @ManyToOne(() => Author, (author) => author.bookAuthors)
  @JoinColumn({ name: 'author_id' })
  author: Relation<Author>;
}
