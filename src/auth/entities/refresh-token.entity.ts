import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per issued refresh token. All tokens from one login share a family;
// revoking a session means setting revoked_at on every row of its family.
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_id', ['userId'])
@Index('IDX_refresh_tokens_family_id', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  // SHA-256 hex of the raw token. The raw token is never stored.
  @Column({
    name: 'token_hash',
    type: 'char',
    length: 64,
    unique: true,
    select: false,
  })
  tokenHash: string;

  // Idle limit: now + REFRESH_IDLE_TTL, renewed on each rotation.
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  // Session hard limit: copied unchanged on rotation.
  @Column({ name: 'absolute_expires_at', type: 'timestamptz' })
  absoluteExpiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'replaced_by', type: 'bigint', nullable: true })
  replacedBy: string | null;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by' })
  replacedByToken: Relation<RefreshToken> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;
}
