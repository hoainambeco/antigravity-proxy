import { MigrationInterface, QueryRunner } from "typeorm";

export class InitApiKeys1790567351337 implements MigrationInterface {
    name = 'InitApiKeys1790567351337'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "api_keys" ("id" varchar PRIMARY KEY NOT NULL, "key" varchar(128) NOT NULL, "name" varchar(255) NOT NULL, "role" varchar(32) NOT NULL DEFAULT ('client'), "isActive" boolean NOT NULL DEFAULT (1), "expiresAt" datetime, "lastUsedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_e42cf55faeafdcce01a82d24849" UNIQUE ("key"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e42cf55faeafdcce01a82d2484" ON "api_keys" ("key") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_e42cf55faeafdcce01a82d2484"`);
        await queryRunner.query(`DROP TABLE "api_keys"`);
    }

}
