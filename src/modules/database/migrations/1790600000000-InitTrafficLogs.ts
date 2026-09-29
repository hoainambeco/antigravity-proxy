import { MigrationInterface, QueryRunner } from "typeorm";

export class InitTrafficLogs1790600000000 implements MigrationInterface {
    name = 'InitTrafficLogs1790600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the legacy raw-SQL table (snake_case columns) if present so the
        // TypeORM entity schema is authoritative.
        await queryRunner.query(`DROP TABLE IF EXISTS "traffic_logs"`);
        await queryRunner.query(`CREATE TABLE "traffic_logs" ("id" varchar(36) PRIMARY KEY NOT NULL, "timestamp" integer NOT NULL, "method" varchar(16) NOT NULL, "endpoint" varchar(512) NOT NULL, "model" varchar(128), "status" integer NOT NULL, "latencyMs" integer NOT NULL DEFAULT (0), "promptTokens" integer NOT NULL DEFAULT (0), "completionTokens" integer NOT NULL DEFAULT (0), "totalTokens" integer NOT NULL DEFAULT (0), "errorMessage" text)`);
        await queryRunner.query(`CREATE INDEX "IDX_traffic_logs_timestamp" ON "traffic_logs" ("timestamp")`);
        await queryRunner.query(`CREATE INDEX "IDX_traffic_logs_model" ON "traffic_logs" ("model")`);
        await queryRunner.query(`CREATE INDEX "IDX_traffic_logs_status" ON "traffic_logs" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "traffic_logs"`);
    }

}