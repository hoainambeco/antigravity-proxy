import { createHash } from "node:crypto";
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Replace the plaintext `api_keys.key` column with `keyHash` (SHA-256 hex) plus a
 * display-only `keyPreview`.
 *
 * Existing keys keep working: each row's digest is computed here, so clients need no
 * change. What is lost is the ability to read a key back out of the database -- which is
 * the point, and is why `down()` refuses to run.
 *
 * SQLite cannot add a UNIQUE NOT NULL column to a populated table, so the table is
 * rebuilt in the usual copy-and-swap shape.
 */
export class HashApiKeys1790630000000 implements MigrationInterface {
  name = "HashApiKeys1790630000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ id: string; key: string }> = await queryRunner.query(
      `SELECT "id", "key" FROM "api_keys"`,
    );

    // Two plaintext keys could differ only by surrounding whitespace and collide once
    // trimmed and hashed. Fail before destroying the column rather than half-way through.
    const seen = new Map<string, string>();
    for (const row of rows) {
      const digest = createHash("sha256")
        .update(row.key.trim(), "utf8")
        .digest("hex");
      const clash = seen.get(digest);
      if (clash) {
        throw new Error(
          `Cannot hash API keys: rows ${clash} and ${row.id} reduce to the same key. ` +
            `Delete one of them and re-run this migration.`,
        );
      }
      seen.set(digest, row.id);
    }

    await queryRunner.query(`DROP INDEX "IDX_e42cf55faeafdcce01a82d2484"`);

    await queryRunner.query(
      `CREATE TABLE "api_keys_hashed" (` +
        `"id" varchar PRIMARY KEY NOT NULL, ` +
        `"keyHash" varchar(64) NOT NULL, ` +
        `"keyPreview" varchar(32) NOT NULL DEFAULT (''), ` +
        `"name" varchar(255) NOT NULL, ` +
        `"role" varchar(32) NOT NULL DEFAULT ('client'), ` +
        `"isActive" boolean NOT NULL DEFAULT (1), ` +
        `"expiresAt" datetime, ` +
        `"lastUsedAt" datetime, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"allowedAccountIds" text, ` +
        `CONSTRAINT "UQ_api_keys_key_hash" UNIQUE ("keyHash"))`,
    );

    // Copy every row across with the key replaced by its digest and preview. The
    // placeholders below are filled per row, so no key value is interpolated into SQL.
    for (const row of rows) {
      const plaintext = row.key.trim();
      const digest = createHash("sha256")
        .update(plaintext, "utf8")
        .digest("hex");
      const preview =
        plaintext.length < 12
          ? "****"
          : `${plaintext.slice(0, 8)}...${plaintext.slice(-4)}`;

      await queryRunner.query(
        `INSERT INTO "api_keys_hashed" (` +
          `"id", "keyHash", "keyPreview", "name", "role", "isActive", ` +
          `"expiresAt", "lastUsedAt", "createdAt", "updatedAt", "allowedAccountIds"` +
          `) SELECT "id", ?, ?, "name", "role", "isActive", "expiresAt", ` +
          `"lastUsedAt", "createdAt", "updatedAt", "allowedAccountIds" ` +
          `FROM "api_keys" WHERE "id" = ?`,
        [digest, preview, row.id],
      );
    }

    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(
      `ALTER TABLE "api_keys_hashed" RENAME TO "api_keys"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_api_keys_key_hash" ON "api_keys" ("keyHash")`,
    );
  }

  public async down(): Promise<void> {
    // A hash cannot be turned back into the key it came from. Reverting the schema would
    // leave every row holding a digest in a column clients authenticate against by
    // plaintext, so every existing key would silently stop working. Recreate the keys
    // instead: `npm run api-key -- create --name <name>`.
    throw new Error(
      "HashApiKeys1790630000000 is irreversible: the plaintext API keys it replaced are " +
        "not recoverable. To go back, check out the previous revision and recreate the keys.",
    );
  }
}
