import { MigrationInterface, QueryRunner } from "typeorm";

export class AddApiKeyAllowedAccounts1790620000000 implements MigrationInterface {
    name = 'AddApiKeyAllowedAccounts1790620000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" ADD "allowedAccountIds" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "allowedAccountIds"`);
    }
}
