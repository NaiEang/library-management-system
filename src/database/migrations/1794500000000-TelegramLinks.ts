import { MigrationInterface, QueryRunner } from 'typeorm';

// Telegram reminders: one row per user linking them to a Telegram chat.
// Additive only: no existing table changes.
export class TelegramLinks1794500000000 implements MigrationInterface {
  name = 'TelegramLinks1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "telegram_links" ("user_id" bigint NOT NULL, "chat_id" bigint, "link_token_hash" character(64), "link_token_expires_at" TIMESTAMP WITH TIME ZONE, "linked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_telegram_links_chat_id" UNIQUE ("chat_id"), CONSTRAINT "UQ_telegram_links_link_token_hash" UNIQUE ("link_token_hash"), CONSTRAINT "PK_telegram_links" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_links" ADD CONSTRAINT "FK_telegram_links_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Closes the table to Supabase's Data API, like the other auth tables;
    // the app connects as the table owner, so it isn't affected.
    await queryRunner.query(
      `ALTER TABLE "telegram_links" ENABLE ROW LEVEL SECURITY`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_links" DROP CONSTRAINT "FK_telegram_links_user"`,
    );
    await queryRunner.query(`DROP TABLE "telegram_links"`);
  }
}
