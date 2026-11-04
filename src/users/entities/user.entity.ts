import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Relation,
  OneToMany,
  Check,
} from 'typeorm';
import { Role } from './role.entity';
import { Member } from '../../members/entities/member.entity';
import { ActivityLog } from '../../dashboard/entities/activity-log.entity';
import { AccountStatus } from '../enums/account-status.enum';

@Entity('users')
@Check('CHK_users_status', `"status" IN ('active', 'disabled')`)
// Emails are stored trimmed and lowercase, so the unique index on "email" is
// effectively case-insensitive.
@Check('CHK_users_email_normalized', `"email" = lower(btrim("email"))`)
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'role_id', type: 'integer' })
  roleId: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // Never loaded unless a query asks for it explicitly; never returned to clients.
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 20, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @OneToOne(() => Member, (member) => member.user)
  member: Member;

  @OneToMany(() => ActivityLog, (log) => log.user)
  activityLogs: Relation<ActivityLog[]>;
}
