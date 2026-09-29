import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import crypto from 'node:crypto';
import { AnthropicOAuthRefresher } from '@/modules/proxy-gateway/upstreams/anthropic/anthropic-oauth-refresher';
import { OpenAIOAuthRefresher } from '@/modules/proxy-gateway/upstreams/openai/openai-oauth-refresher';
import { jsonAccountStoreInstance } from '@/modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';
import { AccountLeaseService } from '@/modules/proxy-gateway/server/modules/account-lease/account-lease.service';
import { OpenAIOAuthCallbackServer } from './OpenAIOAuthCallbackServer';
import type { CloudAccount } from '../types';

export interface CopilotDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface ClaudeOAuthInitResponse {
  authUrl: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}

export interface PendingOpenAiOAuthState {
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

@Injectable()
export class OAuthProviderLoginService {
  private readonly logger = new Logger(OAuthProviderLoginService.name);
  public static readonly COPILOT_CLIENT_ID = 'Ov23ctDVkRmgkPke0Mmm';
  public static readonly OPENAI_CALLBACK_PATH = '/auth/callback';
  private static readonly pendingOpenAiStates = new Map<string, PendingOpenAiOAuthState>();

  constructor(
    private readonly accountLeaseService: AccountLeaseService,
    private readonly openAIOAuthCallbackServer: OpenAIOAuthCallbackServer,
  ) {}

  /**
   * Initializes Claude Code OAuth with PKCE S256
   */
  public initClaudeOAuth(customRedirectUri?: string): ClaudeOAuthInitResponse {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const redirectUri =
      customRedirectUri || 'https://platform.claude.com/oauth/code/callback';

    const params = new URLSearchParams({
      code: 'true',
      client_id: AnthropicOAuthRefresher.CLAUDE_CODE_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    const authUrl = `https://claude.com/cai/oauth/authorize?${params.toString()}`;

    return {
      authUrl,
      codeVerifier,
      state,
      redirectUri,
    };
  }

  /**
   * Exchanges Claude OAuth authorization code for tokens
   */
  public async exchangeClaudeCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    state?: string;
    email?: string;
  }): Promise<CloudAccount> {
    const tokens = await AnthropicOAuthRefresher.exchangeAuthorizationCode(
      params.code,
      params.redirectUri,
      params.codeVerifier,
      params.state,
    );

    let userEmail = params.email;
    if (!userEmail) {
      try {
        const profileRes = await axios.get(
          'https://api.anthropic.com/api/oauth/profile',
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Cache-Control': 'no-cache',
            },
            timeout: 10_000,
          },
        );
        if (profileRes.data?.account?.email) {
          userEmail = profileRes.data.account.email;
        }
      } catch {
        // Fallback if profile fetch fails
      }
    }

    const email = userEmail || `claude-${Date.now()}@antigravity.proxy`;
    const id = `claude-oauth-${Date.now()}`;

    const newAccount: CloudAccount = {
      id,
      provider: 'anthropic',
      auth_type: 'cli_oauth',
      email,
      claude_oauth: tokens,
      claudeAiOauth: tokens,
      token: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || '',
        expires_in: Math.floor((tokens.expiresAt - Date.now()) / 1000),
        expiry_timestamp: Math.floor(tokens.expiresAt / 1000),
        token_type: 'Bearer',
        email,
      },
      created_at: Date.now(),
      last_used: Date.now(),
      health: {},
    };

    await jsonAccountStoreInstance.upsertAccount(newAccount);
    await this.accountLeaseService.loadAccounts();

    this.logger.log(`Added Claude OAuth account: ${email}`);
    return newAccount;
  }

  /**
   * Initializes OpenAI / Codex OAuth with PKCE S256
   */
  public initOpenAIOAuth(customRedirectUri?: string): ClaudeOAuthInitResponse {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const redirectUri =
      customRedirectUri || this.openAIOAuthCallbackServer.getRedirectUri();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OpenAIOAuthRefresher.CODEX_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      state,
      originator: 'codex_cli_rs',
    });

    const authUrl = `https://auth.openai.com/oauth/authorize?${params.toString()}`;

    OAuthProviderLoginService.pendingOpenAiStates.set(state, {
      codeVerifier,
      redirectUri,
      createdAt: Date.now(),
    });

    return {
      authUrl,
      codeVerifier,
      state,
      redirectUri,
    };
  }

  public static getPendingOpenAiState(state: string): PendingOpenAiOAuthState | undefined {
    const pending = OAuthProviderLoginService.pendingOpenAiStates.get(state);
    if (pending && Date.now() - pending.createdAt > 10 * 60 * 1000) {
      OAuthProviderLoginService.pendingOpenAiStates.delete(state);
      return undefined;
    }
    return pending;
  }

  public static consumeOpenAiState(state: string): PendingOpenAiOAuthState | undefined {
    const pending = OAuthProviderLoginService.pendingOpenAiStates.get(state);
    if (pending) {
      OAuthProviderLoginService.pendingOpenAiStates.delete(state);
    }
    return pending;
  }

  /**
   * Exchanges OpenAI / Codex OAuth authorization code for tokens
   */
  public async exchangeOpenAICode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    email?: string;
  }): Promise<CloudAccount> {
    const tokens = await OpenAIOAuthRefresher.exchangeAuthorizationCode(
      params.code,
      params.redirectUri,
      params.codeVerifier,
    );

    let userEmail = params.email;
    let accountId: string | undefined;

    if (tokens.idToken) {
      try {
        const parts = tokens.idToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.email) userEmail = payload.email;
          if (payload.chatgpt_account_id) accountId = payload.chatgpt_account_id;
        }
      } catch {
        // ignore
      }
    }

    if (!userEmail) {
      try {
        const meRes = await axios.get('https://chatgpt.com/backend-api/me', {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'User-Agent': 'codex_cli_rs/0.153.4',
            ...(accountId ? { 'ChatGPT-Account-ID': accountId } : {}),
          },
          timeout: 10_000,
        });
        if (meRes.data?.email) {
          userEmail = meRes.data.email;
        }
      } catch {
        // ignore
      }
    }

    const email = userEmail || `openai-${Date.now()}@antigravity.proxy`;
    const id = `openai-oauth-${Date.now()}`;

    const newAccount: CloudAccount = {
      id,
      provider: 'openai',
      auth_type: 'cli_oauth',
      email,
      account_id: accountId,
      token: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || '',
        expires_in: Math.floor((tokens.expiresAt - Date.now()) / 1000),
        expiry_timestamp: Math.floor(tokens.expiresAt / 1000),
        token_type: 'Bearer',
        email,
      },
      created_at: Date.now(),
      last_used: Date.now(),
      health: {},
    };

    (newAccount as any).openai_oauth = tokens;
    (newAccount as any).tokens = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
      account_id: accountId,
    };

    await jsonAccountStoreInstance.upsertAccount(newAccount);
    await this.accountLeaseService.loadAccounts();

    this.logger.log(`Added OpenAI OAuth account: ${email}`);
    return newAccount;
  }

  public static async exchangeAndSaveOpenAiAccount(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    email?: string;
  }): Promise<CloudAccount> {
    const tokens = await OpenAIOAuthRefresher.exchangeAuthorizationCode(
      params.code,
      params.redirectUri,
      params.codeVerifier,
    );

    let userEmail = params.email;
    let accountId: string | undefined;

    if (tokens.idToken) {
      try {
        const parts = tokens.idToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.email) userEmail = payload.email;
          if (payload.chatgpt_account_id) accountId = payload.chatgpt_account_id;
        }
      } catch {
        // ignore
      }
    }

    if (!userEmail) {
      try {
        const meRes = await axios.get('https://chatgpt.com/backend-api/me', {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'User-Agent': 'codex_cli_rs/0.153.4',
            ...(accountId ? { 'ChatGPT-Account-ID': accountId } : {}),
          },
          timeout: 10_000,
        });
        if (meRes.data?.email) {
          userEmail = meRes.data.email;
        }
      } catch {
        // ignore
      }
    }

    const email = userEmail || `openai-${Date.now()}@antigravity.proxy`;
    const id = `openai-oauth-${Date.now()}`;

    const newAccount: CloudAccount = {
      id,
      provider: 'openai',
      auth_type: 'cli_oauth',
      email,
      account_id: accountId,
      token: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || '',
        expires_in: Math.floor((tokens.expiresAt - Date.now()) / 1000),
        expiry_timestamp: Math.floor(tokens.expiresAt / 1000),
        token_type: 'Bearer',
        email,
      },
      created_at: Date.now(),
      last_used: Date.now(),
      health: {},
    };

    (newAccount as any).openai_oauth = tokens;
    (newAccount as any).tokens = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      id_token: tokens.idToken,
      account_id: accountId,
    };

    await jsonAccountStoreInstance.upsertAccount(newAccount);

    return newAccount;
  }

  /**
   * Starts GitHub Copilot Device Code flow
   */
  public async startCopilotDeviceFlow(): Promise<CopilotDeviceCodeResponse> {
    try {
      const response = await axios.post(
        'https://github.com/login/device/code',
        new URLSearchParams({
          client_id: OAuthProviderLoginService.COPILOT_CLIENT_ID,
          scope: 'read:user,read:org,repo,gist',
        }).toString(),
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15_000,
        },
      );

      return response.data as CopilotDeviceCodeResponse;
    } catch (err: any) {
      this.logger.error('Failed to initiate GitHub Copilot device code flow', err);
      throw new Error(`Failed to start GitHub device flow: ${err.message}`);
    }
  }

  /**
   * Polls for user authorization of GitHub Copilot device code
   */
  public async pollCopilotDeviceCode(params: {
    device_code: string;
    email?: string;
  }): Promise<{
    status: 'success' | 'pending' | 'error' | 'slow_down';
    account?: CloudAccount;
    message?: string;
    retryIntervalSeconds?: number;
  }> {
    try {
      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        new URLSearchParams({
          client_id: OAuthProviderLoginService.COPILOT_CLIENT_ID,
          device_code: params.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }).toString(),
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15_000,
        },
      );

      const data = response.data;

      if (data.error === 'slow_down') {
        // GitHub requires increasing the polling interval by 5 seconds
        return {
          status: 'slow_down',
          retryIntervalSeconds: 10,
          message: 'GitHub yêu cầu chậm lại: tăng khoảng thời gian polling.',
        };
      }

      if (data.error === 'authorization_pending') {
        return { status: 'pending', message: 'Waiting for authorization on github.com/login/device...' };
      }

      if (data.error === 'expired_token') {
        return { status: 'error', message: 'Mã xác thực đã hết hạn. Vui lòng bấm "Lấy mã" lại.' };
      }

      if (data.error === 'access_denied') {
        return { status: 'error', message: 'Bạn đã từ chối cấp quyền trên GitHub.' };
      }

      if (data.error) {
        return { status: 'error', message: data.error_description || data.error };
      }

      if (data.access_token) {
        const email = params.email || `copilot-${Date.now()}@antigravity.proxy`;
        const id = `copilot-${Date.now()}`;

        const newAccount: CloudAccount = {
          id,
          provider: 'copilot',
          auth_type: 'copilot_token',
          email,
          github_token: data.access_token,
          created_at: Date.now(),
          last_used: Date.now(),
          health: {},
        };

        await jsonAccountStoreInstance.upsertAccount(newAccount);
        await this.accountLeaseService.loadAccounts();

        this.logger.log(`Successfully authorized and added GitHub Copilot account: ${email}`);
        return { status: 'success', account: newAccount };
      }

      return { status: 'pending', message: 'Waiting...' };
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        this.logger.warn('GitHub device token polling rate-limited (429)');
        return {
          status: 'slow_down',
          retryIntervalSeconds: 20,
          message: 'GitHub đang giới hạn tốc độ yêu cầu. Chờ thêm rồi thử lại.',
        };
      }
      this.logger.error('Error polling GitHub Copilot device token', err);
      return { status: 'error', message: err.message };
    }
  }
}
