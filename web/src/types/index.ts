export interface SystemStatus {
  version: string;
  uptime_seconds: number;
  port: number;
  routing_strategy: string;
  accounts: {
    total: number;
    active: number;
    in_cooldown: number;
  };
  api_keys: {
    total: number;
    active: number;
  };
  models: {
    total: number;
  };
}

export interface ModelQuotaInfo {
  percentage: number;
  resetTime: string;
  display_name?: string;
  supports_thinking?: boolean;
  thinking_budget?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  supports_images?: boolean;
}

export interface Account {
  id: string;
  email: string;
  provider: string;
  auth_type?: string;
  project_id?: string;
  created_at: number;
  last_used: number;
  is_healthy: boolean;
  is_cooldown: boolean;
  cooldown_remaining_sec?: number;
  quota?: {
    models?: Record<string, ModelQuotaInfo>;
    subscription_tier?: string;
  };
  provider_models?: string[];
  provider_usage?: {
    plan?: string;
    usages: Array<{
      label: string;
      percentage: number;
      used?: number;
      limit?: number;
      resetAt?: string;
    }>;
    unavailable?: string;
  };
}

export interface RoutingRule {
  pattern: string;
  pipeline: string[];
  description?: string;
}

export interface RoutingConfig {
  rules: RoutingRule[];
  default_pipeline: string[];
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  role: 'admin' | 'client';
  isActive: boolean;
  allowedAccountIds?: string[] | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface ModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface AuditRecord {
  requestId: string;
  apiKeyId?: string | null;
  method: string;
  endpoint: string;
  model?: string;
  clientIp?: string;
  status: number;
  latencyMs: number;
  timestamp: number;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

export interface AuthValidateResult {
  valid: boolean;
  keyId?: string | null;
  keyName?: string | null;
  role?: string;
  isMaster?: boolean;
  error?: string;
}
