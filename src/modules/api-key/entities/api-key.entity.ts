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

  @Index({ unique: true })
  @Column({ type: "varchar", length: 128, unique: true })
  key: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "varchar", length: 32, default: "client" })
  role: ApiKeyRole;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "datetime", nullable: true })
  expiresAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
