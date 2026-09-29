import { getServerConfig } from "@/server/server-config";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "node:crypto";
import { Repository } from "typeorm";
import { hasConfiguredApiKey } from "../proxy-gateway/server/guards/api-key-auth.util";
import {
  ApiKeyValidationResult,
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from "./dto/api-key.dto";
import { ApiKey } from "./entities/api-key.entity";

@Injectable()
export class ApiKeyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiKeyService.name);
  private keyCache = new Map<string, ApiKey>();
  private pendingLastUsed = new Map<string, Date>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reloadCache();

    // Periodic flush for lastUsedAt updates (every 30s)
    this.flushTimer = setInterval(() => {
      this.flushPendingLastUsed().catch((err) => {
        this.logger.error("Failed to flush lastUsedAt updates to SQLite:", err);
      });
    }, 30000);
    this.flushTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushPendingLastUsed();
  }

  /**
   * Reload all active keys from SQLite into in-memory cache for ultra-fast validation
   */
  async reloadCache(): Promise<void> {
    try {
      const keys = await this.apiKeyRepository.find();
      this.keyCache.clear();
      for (const item of keys) {
        this.keyCache.set(item.key, item);
      }
      this.logger.log(
        `Loaded ${this.keyCache.size} API key(s) from SQLite database into memory cache.`,
      );
    } catch (err) {
      this.logger.error("Failed to load API keys into cache:", err);
    }
  }

  /**
   * Mask a key for safe display (e.g. sk-ag-1a2b...c3d4)
   */
  maskKey(key: string): string {
    if (!key || key.length < 12) {
      return "****";
    }
    const prefix = key.slice(0, 8);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Check if any key protection is active (either master key in env/config OR keys in DB)
   */
  hasConfiguredProtection(): boolean {
    const config = getServerConfig();
    const envKey = config?.api_key || process.env.PROXY_API_KEY;
    if (hasConfiguredApiKey(envKey)) {
      return true;
    }
    return this.keyCache.size > 0;
  }

  /**
   * Synchronously validate a client token against Master Key and in-memory cache
   */
  validateKeySync(token: string | null | undefined): ApiKeyValidationResult {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "invalid_key" };
    }

    const trimmed = token.trim();
    if (!trimmed) {
      return { valid: false, reason: "invalid_key" };
    }

    // 1. Check Master Key from config or environment
    const config = getServerConfig();
    const masterKey = (
      config?.api_key ||
      process.env.PROXY_API_KEY ||
      ""
    ).trim();
    if (masterKey && trimmed === masterKey) {
      return {
        valid: true,
        isMaster: true,
        role: "admin",
        keyName: "Master Key (.env)",
      };
    }

    // 2. Check in-memory cache
    const keyEntity = this.keyCache.get(trimmed);
    if (!keyEntity) {
      return { valid: false, reason: "invalid_key" };
    }

    if (!keyEntity.isActive) {
      return {
        valid: false,
        reason: "disabled",
        keyId: keyEntity.id,
        keyName: keyEntity.name,
      };
    }

    if (keyEntity.expiresAt && new Date() > new Date(keyEntity.expiresAt)) {
      return {
        valid: false,
        reason: "expired",
        keyId: keyEntity.id,
        keyName: keyEntity.name,
      };
    }

    this.recordLastUsed(keyEntity.id);

    return {
      valid: true,
      isMaster: false,
      role: keyEntity.role,
      keyId: keyEntity.id,
      keyName: keyEntity.name,
    };
  }

  /**
   * Validate a client token against Master Key and dynamic keys in DB
   */
  async validateKey(
    token: string | null | undefined,
  ): Promise<ApiKeyValidationResult> {
    const syncResult = this.validateKeySync(token);
    if (
      syncResult.valid ||
      syncResult.reason === "disabled" ||
      syncResult.reason === "expired"
    ) {
      return syncResult;
    }

    // Fallback to DB if cache miss (e.g. key created via CLI or other process concurrently)
    if (token && typeof token === "string") {
      const trimmed = token.trim();
      const dbKey = await this.apiKeyRepository.findOne({
        where: { key: trimmed },
      });
      if (dbKey) {
        this.keyCache.set(dbKey.key, dbKey);
        return this.validateKeySync(trimmed);
      }
    }

    return syncResult;
  }

  /**
   * Validate if token has admin privileges
   */
  async validateAdminKey(token: string | null | undefined): Promise<boolean> {
    const result = await this.validateKey(token);
    return result.valid && (result.isMaster || result.role === "admin");
  }

  private recordLastUsed(id: string): void {
    this.pendingLastUsed.set(id, new Date());
  }

  private async flushPendingLastUsed(): Promise<void> {
    if (this.pendingLastUsed.size === 0) {
      return;
    }
    const entries = Array.from(this.pendingLastUsed.entries());
    this.pendingLastUsed.clear();

    for (const [id, date] of entries) {
      try {
        await this.apiKeyRepository.update(id, { lastUsedAt: date });
        // Update in cache as well
        for (const item of this.keyCache.values()) {
          if (item.id === id) {
            item.lastUsedAt = date;
            break;
          }
        }
      } catch (err) {
        this.logger.warn(`Could not update lastUsedAt for key ${id}:`, err);
      }
    }
  }

  /**
   * Create a new API Key
   */
  async createKey(dto: CreateApiKeyDto): Promise<ApiKey> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException("API Key name is required");
    }

    let keyValue = dto.customKey?.trim();
    if (keyValue) {
      const existing = await this.apiKeyRepository.findOne({
        where: { key: keyValue },
      });
      if (existing) {
        throw new BadRequestException("API Key with this value already exists");
      }
    } else {
      keyValue = `sk-ag-${randomBytes(24).toString("hex")}`;
    }

    const entity = this.apiKeyRepository.create({
      name: dto.name.trim(),
      key: keyValue,
      role: dto.role || "client",
      isActive: true,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      lastUsedAt: null,
    });

    const saved = await this.apiKeyRepository.save(entity);
    this.keyCache.set(saved.key, saved);
    this.logger.log(
      `Created new API key [${saved.name}] (Role: ${saved.role}, ID: ${saved.id})`,
    );
    return saved;
  }

  /**
   * List all keys (returns masked keys by default, or with optional unmask)
   */
  async listKeys(
    includeRawKey = false,
  ): Promise<Array<Omit<ApiKey, "key"> & { key: string }>> {
    const keys = await this.apiKeyRepository.find({
      order: { createdAt: "DESC" },
    });

    return keys.map((k) => ({
      ...k,
      key: includeRawKey ? k.key : this.maskKey(k.key),
    }));
  }

  async getKeyById(id: string): Promise<ApiKey> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }
    return key;
  }

  async getRawKey(id: string): Promise<string> {
    const key = await this.getKeyById(id);
    return key.key;
  }

  async updateKey(id: string, dto: UpdateApiKeyDto): Promise<ApiKey> {
    const key = await this.getKeyById(id);

    if (dto.name !== undefined) {
      key.name = dto.name.trim();
    }
    if (dto.role !== undefined) {
      key.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      key.isActive = dto.isActive;
    }
    if (dto.expiresAt !== undefined) {
      key.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    const updated = await this.apiKeyRepository.save(key);
    this.keyCache.set(updated.key, updated);
    this.logger.log(
      `Updated API key [${updated.name}] (ID: ${updated.id}, Active: ${updated.isActive})`,
    );
    return updated;
  }

  async deleteKey(id: string): Promise<boolean> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    await this.apiKeyRepository.delete(id);
    this.keyCache.delete(key.key);
    this.logger.log(`Deleted API key [${key.name}] (ID: ${id})`);
    return true;
  }
}
