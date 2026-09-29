import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount } from '@/modules/cloud-account/types';

interface DiscoveredProviderModels {
  byProvider: Map<string, Set<string>>;
  discoveredAt: number;
}

export interface ProviderUsageInfo {
  /** Human-readable plan / tier, e.g. "Copilot Pro", "ChatGPT Plus", "Max". */
  plan?: string;
  /** Usage entries: each has a display label and a 0..100 percentage. */
  usages: Array<{
    label: string;
    percentage: number;
    used?: number;
    limit?: number;
    resetAt?: string;
  }>;
  /** Set when usage could not be fetched (e.g. expired token). */
  unavailable?: string;
}

/**
 * Discovers the model catalog of connected non-Google provider accounts at runtime,
 * so the gateway advertises exactly what each account can actually serve instead of
 * a hardcoded list. Results are cached for a short TTL and refreshed on demand.
 */
@Injectable()
export class ProviderModelDiscoveryService {
  private readonly logger = new Logger(ProviderModelDiscoveryService.name);
  private cache: DiscoveredProviderModels | null = null;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000;

  /**
   * Returns the set of model IDs advertised by connected provider accounts
   * (anthropic, openai, copilot), keyed by the provider type they belong to.
   */
  public async discoverProviderModels(
    accounts: CloudAccount[],
  ): Promise<Map<string, Set<string>>> {
    if (this.cache && Date.now() - this.cache.discoveredAt < ProviderModelDiscoveryService.CACHE_TTL_MS) {
      return this.cache.byProvider;
    }

    const byProvider = new Map<string, Set<string>>();
    const fetchPromises: Array<Promise<void>> = [];

    for (const account of accounts) {
      if (!account.provider || account.provider === 'google') continue;

      fetchPromises.push(
        this.discoverForAccount(account)
          .then((models) => {
            if (models.size === 0) return;
            const key = this.providerKeyFor(account);
            const bucket = byProvider.get(key) || new Set<string>();
            for (const m of models) bucket.add(m);
            byProvider.set(key, bucket);
            this.logger.log(
              `[Model-Discovery] ${key} (${account.email || account.id}): ${models.size} models discovered`,
            );
          })
          .catch((err) => {
            this.logger.warn(
              `[Model-Discovery] Failed to discover models for ${account.provider} account ${account.email || account.id}: ${(err as Error).message}`,
            );
          }),
      );
    }

    await Promise.all(fetchPromises);

    this.cache = { byProvider, discoveredAt: Date.now() };
    return byProvider;
  }

  public invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Fetches usage / quota information for a single non-Google account. Returns a
   * normalized structure the UI can render as percentage bars; when the provider
   * has no quota concept or the token is invalid, returns whatever info is available.
   */
  public async discoverProviderUsage(account: CloudAccount): Promise<ProviderUsageInfo> {
    switch (account.provider) {
      case 'anthropic':
        return this.discoverAnthropicUsage(account);
      case 'openai':
        return this.discoverOpenAIUsage(account);
      case 'copilot':
        return this.discoverCopilotUsage(account);
      default:
        return { usages: [], unavailable: 'No quota data for this provider' };
    }
  }

  private async discoverCopilotUsage(account: CloudAccount): Promise<ProviderUsageInfo> {
    const githubToken = account.github_token || account.api_key || account.token?.access_token;
    if (!githubToken) {
      return { usages: [], unavailable: 'No GitHub token linked to this Copilot account' };
    }

    try {
      const tokenRes = await axios.get('https://api.github.com/copilot_internal/v2/token', {
        headers: {
          Authorization: `token ${githubToken}`,
          'Editor-Version': 'vscode/1.98.0',
          'Editor-Plugin-Version': 'copilot-chat/0.24.0',
          'User-Agent': 'GitHubCopilotChat/0.24.0',
          Accept: 'application/json',
        },
        timeout: 15_000,
      });
      const data = tokenRes.data || {};
      const usages: ProviderUsageInfo['usages'] = [];

      const sliding = data.sliding_window_limit;
      if (sliding && typeof sliding.limit === 'number') {
        const used = Number(sliding.usage?.completion_tokens ?? 0) + Number(sliding.usage?.prompt_tokens ?? 0);
        const limit = sliding.limit;
        usages.push({
          label: 'Sliding Window Usage',
          used,
          limit,
          percentage: limit > 0 ? Math.max(0, Math.min(100, Math.round((used / limit) * 100))) : 0,
          resetAt: sliding.reset_time,
        });
      }

      const daily = data.daily_usage;
      if (daily && typeof daily === 'object') {
        const used = Number(daily.completion_tokens ?? 0) + Number(daily.prompt_tokens ?? 0);
        usages.push({
          label: 'Daily Usage (tokens)',
          used,
          percentage: used > 0 ? Math.min(100, Math.round(used / 1000)) : 0,
        });
      }

      return {
        plan: data.plan || 'Copilot',
        usages: usages.length > 0 ? usages : [{ label: 'Copilot', percentage: 0 }],
      };
    } catch (err) {
      return {
        usages: [],
        unavailable: `Copilot token invalid or expired: ${(err as Error).message}`,
      };
    }
  }

  private async discoverOpenAIUsage(account: CloudAccount): Promise<ProviderUsageInfo> {
    if (account.auth_type === 'api_key' && account.api_key) {
      return { plan: 'OpenAI API', usages: [{ label: 'Pay-as-you-go', percentage: 0 }] };
    }

    const accessToken = account.token?.access_token;
    if (!accessToken) {
      return { usages: [], unavailable: 'No access token linked to this ChatGPT account' };
    }

    try {
      const accountId = account.account_id || (account as any).tokens?.account_id;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'codex_cli_rs/0.153.4',
      };
      if (accountId) headers['ChatGPT-Account-ID'] = accountId;

      // Resolve the plan from the account check endpoint, which carries plan_type.
      let plan = 'ChatGPT';
      try {
        const checkRes = await axios.get(
          'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27',
          { headers, timeout: 15_000 },
        );
        const accounts = checkRes.data?.accounts || {};
        const first = Object.values(accounts)[0] as any;
        const accountInfo = first?.account;
        if (accountInfo?.plan_display_name) {
          plan = String(accountInfo.plan_display_name);
        } else if (accountInfo?.plan_type) {
          plan = String(accountInfo.plan_type);
        }
      } catch {
        // plan resolution is best-effort
      }

      return {
        plan,
        usages: [{ label: 'ChatGPT plan', percentage: 0 }],
      };
    } catch (err) {
      return {
        usages: [],
        unavailable: `ChatGPT usage unavailable: ${(err as Error).message}`,
      };
    }
  }

  private async discoverAnthropicUsage(account: CloudAccount): Promise<ProviderUsageInfo> {
    // Anthropic exposes no public per-plan quota endpoint for CLI/web accounts.
    // Surface the tier stored at login time when present, otherwise leave a note.
    const tier =
      account.claude_oauth?.rateLimitTier ||
      account.claudeAiOauth?.rateLimitTier ||
      account.claude_oauth?.subscriptionType ||
      account.claudeAiOauth?.subscriptionType;
    if (tier) {
      return { plan: String(tier), usages: [{ label: 'Anthropic plan', percentage: 0 }] };
    }
    return { usages: [], unavailable: 'Anthropic does not expose public quota for this account type' };
  }

  private providerKeyFor(account: CloudAccount): string {
    if (account.provider === 'anthropic') {
      return account.auth_type === 'api_key' ? 'anthropic_api' : 'anthropic_oauth';
    }
    if (account.provider === 'openai') {
      return account.auth_type === 'api_key' ? 'openai_api' : 'chatgpt_web';
    }
    if (account.provider === 'copilot') {
      return 'copilot';
    }
    return account.provider;
  }

  private async discoverForAccount(account: CloudAccount): Promise<Set<string>> {
    switch (account.provider) {
      case 'anthropic':
        return this.discoverAnthropic(account);
      case 'openai':
        return this.discoverOpenAI(account);
      case 'copilot':
        return this.discoverCopilot(account);
      default:
        return new Set<string>();
    }
  }

  private async discoverAnthropic(account: CloudAccount): Promise<Set<string>> {
    const apiKey = account.api_key;
    if (!apiKey) {
      // Anthropic OAuth / web session accounts have no public model list endpoint
      // that we can reach without a dedicated listing API; fall back to a minimal
      // well-known set so the account remains usable.
      return new Set<string>(['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-3-7-sonnet', 'claude-3-5-sonnet']);
    }

    const response = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 15_000,
    });

    const models = new Set<string>();
    for (const model of response.data?.data ?? []) {
      const id = model?.id;
      if (typeof id === 'string' && id) models.add(id);
    }
    return models;
  }

  private async discoverOpenAI(account: CloudAccount): Promise<Set<string>> {
    if (account.auth_type === 'api_key' && account.api_key) {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${account.api_key}` },
        timeout: 15_000,
      });
      const models = new Set<string>();
      for (const model of response.data?.data ?? []) {
        const id = model?.id;
        if (typeof id === 'string' && id) models.add(id);
      }
      return models;
    }

    // ChatGPT web / Codex OAuth: query the ChatGPT backend model catalog.
    const accessToken = account.token?.access_token;
    if (!accessToken) return new Set<string>();

    const accountId = account.account_id || (account as any).tokens?.account_id;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'codex_cli_rs/0.153.4',
    };
    if (accountId) headers['ChatGPT-Account-ID'] = accountId;

    const response = await axios.get('https://chatgpt.com/backend-api/models', {
      headers,
      timeout: 15_000,
    });

    const models = new Set<string>();
    for (const model of response.data?.models ?? []) {
      const slug = model?.slug;
      if (typeof slug === 'string' && slug) models.add(slug);
    }
    return models;
  }

  private async discoverCopilot(account: CloudAccount): Promise<Set<string>> {
    const githubToken = account.github_token || account.api_key || account.token?.access_token;
    if (!githubToken) {
      return this.copilotFallbackModels();
    }

    try {
      // Resolve the Copilot session token, then query the Copilot model catalog.
      const tokenRes = await axios.get('https://api.github.com/copilot_internal/v2/token', {
        headers: {
          Authorization: `token ${githubToken}`,
          'Editor-Version': 'vscode/1.98.0',
          'Editor-Plugin-Version': 'copilot-chat/0.24.0',
          'User-Agent': 'GitHubCopilotChat/0.24.0',
          Accept: 'application/json',
        },
        timeout: 15_000,
      });
      const copilotToken = tokenRes.data?.token;
      if (!copilotToken) return this.copilotFallbackModels();

      const apiEndpoint = tokenRes.data?.endpoints?.api || 'https://api.githubcopilot.com';

      try {
        const listRes = await axios.get(`${apiEndpoint}/models`, {
          headers: {
            Authorization: `Bearer ${copilotToken}`,
            'User-Agent': 'GitHubCopilotChat/0.24.0',
            Accept: 'application/json',
          },
          timeout: 15_000,
        });
        const models = new Set<string>();
        for (const model of listRes.data?.data ?? []) {
          const id = model?.id;
          if (typeof id === 'string' && id) models.add(id);
        }
        if (models.size > 0) return models;
      } catch {
        // Model catalog endpoint may be unsupported on some plans; fall back below.
      }

      return this.copilotFallbackModels();
    } catch (err) {
      // Token exchange failed (e.g. GitHub token expired/revoked). Advertise the
      // standard Copilot model set anyway so the account still appears; requests
      // will fail over to the next provider until the account is re-linked.
      this.logger.warn(
        `[Model-Discovery] Copilot token exchange failed for ${account.email || account.id}, advertising fallback model set: ${(err as Error).message}`,
      );
      return this.copilotFallbackModels();
    }
  }

  private copilotFallbackModels(): Set<string> {
    return new Set<string>([
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3-7-sonnet',
      'claude-3-5-sonnet',
    ]);
  }
}