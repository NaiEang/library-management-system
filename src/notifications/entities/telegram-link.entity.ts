import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// A user's Telegram connection, one row per user. POST
// /notifications/telegram/link stores a one-time token (only its SHA-256);
// when the user presses Start in the bot with that token, chat_id is set and
// the token is cleared. A Telegram chat belongs to at most one user.
@Entity('telegram_links')
@Unique('UQ_telegram_links_chat_id', ['chatId'])
@Unique('UQ_telegram_links_link_token_hash', ['linkTokenHash'])
export class TelegramLink {
  @PrimaryColumn({
    name: 'user_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_telegram_links',
  })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_telegram_links_user',
  })
  user: Relation<User>;

  // Where reminders go; null until linked (or after unlinking).
  @Column({ name: 'chat_id', type: 'bigint', nullable: true })
  chatId: string | null;

  @Column({
    name: 'link_token_hash',
    type: 'char',
    length: 64,
    nullable: true,
    select: false,
  })
  linkTokenHash: string | null;

  @Column({
    name: 'link_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  linkTokenExpiresAt: Date | null;

  @Column({ name: 'linked_at', type: 'timestamptz', nullable: true })
  linkedAt: Date | null;
}
