import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBookItemType1794494546512 implements MigrationInterface {
    name = 'AddBookItemType1794494546512';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "item_type" varchar(50) NOT NULL DEFAULT 'book'`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "books" DROP COLUMN IF EXISTS "item_type"`);
    }
}
