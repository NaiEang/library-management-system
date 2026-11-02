import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793626719884 implements MigrationInterface {
    name = 'InitialSchema1793626719884'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "fk_activity_logs_user"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_role"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "fk_payments_member"`);
        await queryRunner.query(`ALTER TABLE "members" DROP CONSTRAINT "fk_members_user"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "fk_loans_member"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "fk_loan_items_book_copy"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "fk_loan_items_loan"`);
        await queryRunner.query(`ALTER TABLE "book_copies" DROP CONSTRAINT "fk_book_copies_book"`);
        await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "fk_books_category"`);
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "fk_book_authors_author"`);
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "fk_book_authors_book"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "fk_notifications_user"`);
        await queryRunner.query(`DROP INDEX "public"."idx_activity_logs_entity"`);
        await queryRunner.query(`DROP INDEX "public"."idx_activity_logs_action"`);
        await queryRunner.query(`DROP INDEX "public"."idx_activity_logs_user_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_loan_items_copy_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_book_authors_author_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_created_at"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "chk_payment_amount_positive"`);
        await queryRunner.query(`ALTER TABLE "members" DROP CONSTRAINT "chk_members_deposit_nonnegative"`);
        await queryRunner.query(`ALTER TABLE "members" DROP CONSTRAINT "chk_membership_date_range"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "chk_loan_item_fine_nonnegative"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "chk_loan_item_due_date"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "chk_loan_item_return_date"`);
        await queryRunner.query(`ALTER TABLE "members" ALTER COLUMN "membership_date" SET DEFAULT ('now'::text)::date`);
        await queryRunner.query(`ALTER TABLE "members" ALTER COLUMN "deposit_amount" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "fine_amount" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_d54f841fa5478e4734590d44036" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_dfdbf70a291f7d0431cd606428f" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "members" ADD CONSTRAINT "FK_da404b5fd9c390e25338996e2d1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "FK_7574818334cefaa01a3a8308ed3" FOREIGN KEY ("book_copy_id") REFERENCES "book_copies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_copies" ADD CONSTRAINT "FK_d8c3c9e0b8d41aa149ac58f23fe" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "books" ADD CONSTRAINT "FK_46f5b35b90175a660f99810bc97" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "FK_1d68802baf370cd6818cad7a503" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "FK_6fb8ac32a0a0bbca076b2cf7c5a" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "FK_6fb8ac32a0a0bbca076b2cf7c5a"`);
        await queryRunner.query(`ALTER TABLE "book_authors" DROP CONSTRAINT "FK_1d68802baf370cd6818cad7a503"`);
        await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "FK_46f5b35b90175a660f99810bc97"`);
        await queryRunner.query(`ALTER TABLE "book_copies" DROP CONSTRAINT "FK_d8c3c9e0b8d41aa149ac58f23fe"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_7574818334cefaa01a3a8308ed3"`);
        await queryRunner.query(`ALTER TABLE "loan_items" DROP CONSTRAINT "FK_09ff589d345f87cc5ba5e7a2aee"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_7f4f9757fb65bb6aad252ea1f76"`);
        await queryRunner.query(`ALTER TABLE "members" DROP CONSTRAINT "FK_da404b5fd9c390e25338996e2d1"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_dfdbf70a291f7d0431cd606428f"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_d54f841fa5478e4734590d44036"`);
        await queryRunner.query(`ALTER TABLE "loan_items" ALTER COLUMN "fine_amount" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "members" ALTER COLUMN "deposit_amount" SET DEFAULT 0.00`);
        await queryRunner.query(`ALTER TABLE "members" ALTER COLUMN "membership_date" SET DEFAULT CURRENT_DATE`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "chk_loan_item_return_date" CHECK (((returned_at IS NULL) OR (returned_at >= borrowed_at)))`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "chk_loan_item_due_date" CHECK ((due_date >= borrowed_at))`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "chk_loan_item_fine_nonnegative" CHECK ((fine_amount >= (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "members" ADD CONSTRAINT "chk_membership_date_range" CHECK ((expiry_date >= membership_date))`);
        await queryRunner.query(`ALTER TABLE "members" ADD CONSTRAINT "chk_members_deposit_nonnegative" CHECK ((deposit_amount >= (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payment_amount_positive" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_book_authors_author_id" ON "book_authors" USING btree ("author_id") `);
        await queryRunner.query(`CREATE INDEX "idx_loan_items_copy_status" ON "loan_items" USING btree ("book_copy_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_activity_logs_user_created" ON "activity_logs" USING btree ("created_at", "user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_activity_logs_action" ON "activity_logs" USING btree ("action") `);
        await queryRunner.query(`CREATE INDEX "idx_activity_logs_entity" ON "activity_logs" USING btree ("entity_id", "entity_type") `);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "fk_book_authors_book" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_authors" ADD CONSTRAINT "fk_book_authors_author" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "books" ADD CONSTRAINT "fk_books_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "book_copies" ADD CONSTRAINT "fk_book_copies_book" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "fk_loan_items_loan" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_items" ADD CONSTRAINT "fk_loan_items_book_copy" FOREIGN KEY ("book_copy_id") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "fk_loans_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "members" ADD CONSTRAINT "fk_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_member" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "fk_users_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "fk_activity_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
