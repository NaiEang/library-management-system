import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// At most one code per user: sending a new code replaces the old row, so only
// the newest code can ever be accepted. The row is deleted once the email is
// verified. The raw code is never stored, only its HMAC.
@Entity('email_verification_codes')
@Check(
  'CHK_email_verification_codes_counts',
  `"attempts" >= 0 AND "send_count" >= 1`,
)
export class EmailVerificationCode {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  // HMAC-SHA256 hex of the 6-digit code. Never selected unless asked for.
  @Column({ name: 'code_hash', type: 'char', length: 64, select: false })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  // Wrong guesses against this code; at the limit the code is dead.
  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  // When this code was sent: the resend cooldown counts from here.
  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  // Codes sent since send_window_started_at. Capping codes per day caps the
  // total number of guesses (codes x tries per code), whatever the IP.
  @Column({ name: 'send_count', type: 'smallint', default: 1 })
  sendCount: number;

  @Column({ name: 'send_window_started_at', type: 'timestamptz' })
  sendWindowStartedAt: Date;
}
