import { AnthropicChatRequest } from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
  'claude-3-7-sonnet-thought': 'claude-3-7-sonnet-20250219',
  'claude-3-7-sonnet-thinking': 'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest': 'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  'claude-3-5-haiku-latest': 'claude-3-5-haiku-20241022',
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-opus-latest': 'claude-3-opus-20240229',
  'claude-sonnet-4-6': 'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-6-thinking': 'claude-3-7-sonnet-20250219',
  'claude-opus-4-6': 'claude-3-opus-20240229',
  'claude-opus-4-6-thinking': 'claude-3-opus-20240229',
};

export function normalizeAnthropicOfficialModel(requestedModel: string): string {
  const clean = (requestedModel || '').trim().replace(/^models\//i, '').toLowerCase();
  return ANTHROPIC_MODEL_MAP[clean] || requestedModel;
}

export function sanitizeAnthropicOfficialRequest(req: AnthropicChatRequest): Record<string, unknown> {
  const normalizedModel = normalizeAnthropicOfficialModel(req.model);
  const isThoughtModel = req.model.includes('thought') || req.model.includes('thinking');

  const payload: Record<string, unknown> = {
    ...req,
    model: normalizedModel,
  };

  // Ensure max_tokens exists (Anthropic requires max_tokens)
  if (!payload.max_tokens) {
    payload.max_tokens = 4096;
  }

  // Handle thinking parameter
  if (isThoughtModel && !payload.thinking) {
    const budgetTokens = 4000;
    payload.thinking = {
      type: 'enabled',
      budget_tokens: budgetTokens,
    };
    if (typeof payload.max_tokens === 'number' && payload.max_tokens <= budgetTokens) {
      payload.max_tokens = budgetTokens + 2000;
    }
    // When thinking is enabled, Anthropic requires temperature to be 1.0 or omitted
    delete payload.temperature;
    delete payload.top_p;
  }

  return payload;
}
