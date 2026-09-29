export type UpstreamProviderType =
  | 'google'
  | 'anthropic_api'
  | 'anthropic_oauth'
  | 'anthropic_web'
  | 'openai_api'
  | 'copilot'
  | 'chatgpt_web';

export type UpstreamProviderTarget =
  | UpstreamProviderType
  | 'anthropic' // Resolves to available anthropic_* types
  | 'openai';   // Resolves to available openai_* / copilot types

export interface RoutingRule {
  /** Regex pattern or model prefix/id to match against requested model (case-insensitive) */
  pattern: string;
  /** Ordered list of upstream providers to attempt in sequence */
  pipeline: UpstreamProviderTarget[];
  /** Optional human-readable description for dashboard/logs */
  description?: string;
}

export interface RoutingConfig {
  /** Ordered routing rules evaluated sequentially (first match wins) */
  rules: RoutingRule[];
  /** Default pipeline when no specific rule matches */
  default_pipeline: UpstreamProviderTarget[];
}
