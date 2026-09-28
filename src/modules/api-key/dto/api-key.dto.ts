import { ApiKeyRole } from "../entities/api-key.entity";

export interface CreateApiKeyDto {
  name: string;
  role?: ApiKeyRole;
  customKey?: string;
  expiresAt?: Date | string | null;
}

export interface UpdateApiKeyDto {
  name?: string;
  role?: ApiKeyRole;
  isActive?: boolean;
  expiresAt?: Date | string | null;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  isMaster?: boolean;
  role?: ApiKeyRole;
  keyId?: string;
  keyName?: string;
  reason?: "invalid_key" | "disabled" | "expired";
}
