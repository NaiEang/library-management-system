import { getMetadataArgsStorage } from 'typeorm';
import { Member } from '../../members/entities/member.entity';
import { Role } from '../../users/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from './refresh-token.entity';

// Pins the entity definitions to docs/context/erd-changes-auth.md, so a wrong
// column name or a lost select:false fails here before any migration is generated.
const storage = getMetadataArgsStorage();
const column = (target: object, property: string) =>
  storage.columns.find(
    (c) => c.target === target && c.propertyName === property,
  )?.options;
const checks = (target: object) =>
  storage.checks.filter((c) => c.target === target).map((c) => c.expression);
const relation = (target: object, property: string) =>
  storage.relations.find(
    (r) => r.target === target && r.propertyName === property,
  );

describe('Auth & Users schema contract', () => {
  describe('users', () => {
    it('stores the password as password_hash and never selects it by default', () => {
      expect(column(User, 'passwordHash')).toMatchObject({
        name: 'password_hash',
        select: false,
      });
      expect(column(User, 'password')).toBeUndefined();
    });

    it('limits status to active | disabled, defaulting to active', () => {
      expect(column(User, 'status')).toMatchObject({ default: 'active' });
      expect(checks(User)).toContain(`"status" IN ('active', 'disabled')`);
    });

    it('only accepts normalized emails, on top of the unique index', () => {
      expect(column(User, 'email')).toMatchObject({ unique: true });
      expect(checks(User)).toContain(`"email" = lower(btrim("email"))`);
    });

    it('has a nullable last_login_at', () => {
      expect(column(User, 'lastLoginAt')).toMatchObject({
        name: 'last_login_at',
        nullable: true,
      });
    });
  });

  it('roles: only ADMIN, LIBRARIAN and MEMBER', () => {
    expect(checks(Role)).toContain(
      `"name" IN ('ADMIN', 'LIBRARIAN', 'MEMBER')`,
    );
  });

  describe('refresh_tokens', () => {
    it('stores only a 64-char SHA-256 hex hash, unique, never selected by default', () => {
      expect(column(RefreshToken, 'tokenHash')).toMatchObject({
        name: 'token_hash',
        type: 'char',
        length: 64,
        unique: true,
        select: false,
      });
    });

    it('has the documented columns', () => {
      expect(column(RefreshToken, 'familyId')).toMatchObject({
        name: 'family_id',
        type: 'uuid',
      });
      expect(column(RefreshToken, 'expiresAt')).toMatchObject({
        name: 'expires_at',
      });
      expect(column(RefreshToken, 'absoluteExpiresAt')).toMatchObject({
        name: 'absolute_expires_at',
      });
      expect(column(RefreshToken, 'revokedAt')).toMatchObject({
        name: 'revoked_at',
        nullable: true,
      });
      expect(column(RefreshToken, 'replacedBy')).toMatchObject({
        name: 'replaced_by',
        nullable: true,
      });
      expect(column(RefreshToken, 'userAgent')).toMatchObject({
        name: 'user_agent',
        length: 255,
      });
      expect(column(RefreshToken, 'ipAddress')).toMatchObject({
        name: 'ip_address',
        length: 45,
      });
    });

    it('cascades on user delete', () => {
      expect(relation(RefreshToken, 'user')?.options).toMatchObject({
        onDelete: 'CASCADE',
        nullable: false,
      });
    });

    it('is indexed by user_id and family_id', () => {
      const indexed = storage.indices
        .filter((i) => i.target === RefreshToken)
        .map((i) => i.columns);
      expect(indexed).toEqual(
        expect.arrayContaining([['userId'], ['familyId']]),
      );
    });
  });

  describe('members', () => {
    it('limits membership_status to pending_deposit | active | expired, defaulting to pending_deposit', () => {
      expect(column(Member, 'membershipStatus')).toMatchObject({
        default: 'pending_deposit',
      });
      expect(checks(Member)).toContain(
        `"membership_status" IN ('pending_deposit', 'active', 'expired')`,
      );
    });

    it('restores the original deposit and date-range checks', () => {
      expect(checks(Member)).toContain(`"deposit_amount" >= 0`);
      expect(checks(Member)).toContain(
        `"expiry_date" IS NULL OR "expiry_date" >= "membership_date"`,
      );
      expect(column(Member, 'depositAmount')).toMatchObject({ default: 0 });
    });

    it('has no "blocked" or "suspended" membership status', () => {
      expect(checks(Member).join(' ')).not.toMatch(/blocked|suspended/);
    });

    it('allows a null expiry_date until the deposit is verified', () => {
      expect(column(Member, 'expiryDate')).toMatchObject({
        name: 'expiry_date',
        nullable: true,
      });
    });

    it('records who verified the deposit and when', () => {
      expect(column(Member, 'depositVerifiedAt')).toMatchObject({
        name: 'deposit_verified_at',
        type: 'timestamptz',
        nullable: true,
      });
      expect(column(Member, 'depositVerifiedBy')).toMatchObject({
        name: 'deposit_verified_by',
        nullable: true,
      });
      expect(relation(Member, 'depositVerifiedByUser')?.options).toMatchObject({
        onDelete: 'RESTRICT',
      });
    });

    it('has a nullable blocked_until timestamptz for Circulation', () => {
      expect(column(Member, 'blockedUntil')).toMatchObject({
        name: 'blocked_until',
        type: 'timestamptz',
        nullable: true,
      });
    });

    it('keeps the fields and relations loans and payments read', () => {
      expect(column(Member, 'depositAmount')).toMatchObject({
        name: 'deposit_amount',
      });
      expect(relation(Member, 'loans')).toBeDefined();
      expect(relation(Member, 'payments')).toBeDefined();
      expect(relation(Member, 'user')).toBeDefined();
    });
  });
});
