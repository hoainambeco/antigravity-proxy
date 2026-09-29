import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type ApiKeyRole = "client" | "admin";

@Entity("api_keys")
export class ApiKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * SHA-256 hex digest of the key. The key itself is shown once, at creation, and is not
   * recoverable afterwards -- see api-key-hash.ts.
   */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 64, unique: true })
  keyHash: string;

  /** Masked form for display, e.g. `sk-ag-1a...c3d4`. Not a credential. */
  @Column({ type: "varchar", length: 32, default: "" })
  keyPreview: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 32, default: "client" })
  role: ApiKeyRole;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "simple-json", nullable: true })
  allowedAccountIds: string[] | null;

  @Column({ type: "datetime", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
