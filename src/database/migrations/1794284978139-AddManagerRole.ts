import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the "manager" role (Sothcheat; approved by Naieang): admin > manager >
// librarian > member. Written by hand: TypeORM compares check constraints by
// name, so it doesn't see that CHK_roles_name now allows one more value.
// Additive only: no existing row changes.
export class AddManagerRole1794284978139 implements MigrationInterface {
    name = 'AddManagerRole1794284978139'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT "CHK_roles_name"`);
        await queryRunner.query(`ALTER TABLE "roles" ADD CONSTRAINT "CHK_roles_name" CHECK ("name" IN ('admin', 'manager', 'librarian', 'member'))`);
        await queryRunner.query(`INSERT INTO "roles" ("name", "description") VALUES ('manager', 'Manages librarians and members (later: one campus)') ON CONFLICT ("name") DO NOTHING`);
    }

    // Fails on purpose while any user still has the manager role (the foreign
    // key from users.role_id), so reverting can't orphan accounts.
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "roles" WHERE "name" = 'manager'`);
        await queryRunner.query(`ALTER TABLE "roles" DROP CONSTRAINT "CHK_roles_name"`);
        await queryRunner.query(`ALTER TABLE "roles" ADD CONSTRAINT "CHK_roles_name" CHECK ("name" IN ('admin', 'librarian', 'member'))`);
    }

}
