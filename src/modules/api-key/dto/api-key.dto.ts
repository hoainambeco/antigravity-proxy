import { ApiKeyRole } from "../entities/api-key.entity";

export interface CreateApiKeyDto {
  name: string;
  role?: ApiKeyRole;
  customKey?: string;
  allowedAccountIds?: string[] | null;
  expiresAt?: Date | string | null;
}

export interface UpdateApiKeyDto {
  name?: string;
  role?: ApiKeyRole;
  isActive?: boolean;
  allowedAccountIds?: string[] | null;
  expiresAt?: Date | string | null;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  isMaster?: boolean;
  role?: ApiKeyRole;
  keyId?: string;
  keyName?: string;
  allowedAccountIds?: string[] | null;
  reason?: "invalid_key" | "disabled" | "expired";
}
