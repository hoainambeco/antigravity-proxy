import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTrafficLogApiKey1790610000000 implements MigrationInterface {
    name = 'AddTrafficLogApiKey1790610000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "traffic_logs" ADD "apiKeyId" varchar(36)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_traffic_logs_apiKeyId" ON "traffic_logs" ("apiKeyId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_traffic_logs_apiKeyId"`);
        await queryRunner.query(`ALTER TABLE "traffic_logs" DROP COLUMN "apiKeyId"`);
    }

}