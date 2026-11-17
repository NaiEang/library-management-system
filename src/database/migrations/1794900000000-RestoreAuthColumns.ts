import { MigrationInterface, QueryRunner } from 'typeorm';

// Repair (Sothcheat, 2026-11-17). On the shared Supabase database,
// users.email_verified_at and members.gold_until (with its check) went
// missing although EmailVerification and GoldMembership are recorded as run.
// Something compared the schema with entities older than part 4 and dropped
// them, so every login failed with a 500.
//
// Re-adds exactly what those two migrations added, only where it's missing,
// so it changes nothing on a database that is already correct.
export class RestoreAuthColumns1794900000000 implements MigrationInterface {
  name = 'RestoreAuthColumns1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // From EmailVerification1794468494571
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Staff count as verified (only members verify their email). Members
    // whose date was lost verify again with a new code.
    await queryRunner.query(
      `UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL AND "role_id" IN (SELECT "id" FROM "roles" WHERE "name" <> 'member')`,
    );

    // From GoldMembership1794471737605
    await queryRunner.query(
      `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "gold_until" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "CHK_members_gold_until"`,
    );
    await queryRunner.query(
      `ALTER TABLE "members" ADD CONSTRAINT "CHK_members_gold_until" CHECK ("gold_until" IS NULL OR "gold_until" > "membership_date")`,
    );
  }

  // Nothing to undo: the columns belong to EmailVerification and
  // GoldMembership, whose own down() removes them.
  public async down(): Promise<void> {}
}
