import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateLoanSchema1793711619886 implements MigrationInterface {
    name = 'UpdateLoanSchema1793711619886'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_7574818334cefaa01a3a8308ed3"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "loans_loan_code_key"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "loan_code"`);
        await queryRunner.query(`ALTER TABLE "loans" ADD "loan_code" character varying`);
        await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "loan_date" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "loan_date" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "loans" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "borrowed_at" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "borrowed_at" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "due_date" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_7574818334cefaa01a3a8308ed3" FOREIGN KEY ("book_copy_id") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_7574818334cefaa01a3a8308ed3"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD "status" character varying(30) NOT NULL DEFAULT 'borrowed'`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "due_date" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "borrowed_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "borrowed_at" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "loans" ADD "status" character varying(30) NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "loan_date" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "loans" ALTER COLUMN "loan_date" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loans" DROP COLUMN "loan_code"`);
        await queryRunner.query(`ALTER TABLE "loans" ADD "loan_code" character varying(50) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "loans_loan_code_key" UNIQUE ("loan_code")`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_7574818334cefaa01a3a8308ed3" FOREIGN KEY ("book_copy_id") REFERENCES "book_copies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
