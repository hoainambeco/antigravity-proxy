import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount, ClaudeAiOAuthData } from '@/modules/cloud-account/types';
import { jsonAccountStoreInstance } from '@/modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';

@Injectable()
export class AnthropicOAuthRefresher {
  private static readonly logger = new Logger(AnthropicOAuthRefresher.name);
  public static readonly TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token';
  public static readonly CLAUDE_CODE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

  public static shouldRefresh(account: CloudAccount): boolean {
    const expiresAt =
      account.claude_oauth?.expiresAt ||
      account.claudeAiOauth?.expiresAt ||
      (account.token?.expiry_timestamp ? account.token.expiry_timestamp * 1000 : undefined);

    if (!expiresAt) {
      return false;
    }

    // Refresh if expiring in less than 5 minutes (300_000 ms) or already expired
    return Date.now() >= expiresAt - 300_000;
  }

  public static async refreshAccessToken(account: CloudAccount): Promise<boolean> {
    const refreshToken =
      account.claude_oauth?.refreshToken ||
      account.claudeAiOauth?.refreshToken ||
      account.token?.refresh_token;

    if (!refreshToken) {
      return false;
    }

    try {
      this.logger.log(`Refreshing Anthropic OAuth access token for account ${account.id}...`);
      const response = await axios.post(
        this.TOKEN_URL,
        {
          grant_type: 'refresh_token',
          client_id: this.CLAUDE_CODE_CLIENT_ID,
          refresh_token: refreshToken,
        },
        {
          headers: {
            'content-type': 'application/json',
          },
          timeout: 20_000,
        },
      );

      const data = response.data;
      if (data?.access_token) {
        const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 86400;

        if (!account.claude_oauth) {
          account.claude_oauth = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresAt: Date.now() + expiresInSec * 1000,
          };
        } else {
          account.claude_oauth.accessToken = data.access_token;
          if (data.refresh_token) {
            account.claude_oauth.refreshToken = data.refresh_token;
          }
          account.claude_oauth.expiresAt = Date.now() + expiresInSec * 1000;
        }

        if (account.claudeAiOauth) {
          account.claudeAiOauth.accessToken = data.access_token;
          if (data.refresh_token) {
            account.claudeAiOauth.refreshToken = data.refresh_token;
          }
          account.claudeAiOauth.expiresAt = Date.now() + expiresInSec * 1000;
        }

        if (!account.token) {
          account.token = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || refreshToken,
            expires_in: expiresInSec,
            expiry_timestamp: Math.floor(Date.now() / 1000) + expiresInSec,
            token_type: 'Bearer',
          };
        } else {
          account.token.access_token = data.access_token;
          if (data.refresh_token) account.token.refresh_token = data.refresh_token;
          account.token.expires_in = expiresInSec;
          account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + expiresInSec;
        }

        // Auto-persist refreshed token to accounts.json
        void jsonAccountStoreInstance.upsertAccount(account).catch(() => {});
        this.logger.log(`Successfully refreshed Anthropic OAuth token for account ${account.id}`);
        return true;
      }
    } catch (err) {
      this.logger.error(`Failed to refresh Anthropic OAuth token for account ${account.id}`, err);
    }

    return false;
  }

  public static async exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
    state?: string,
  ): Promise<ClaudeAiOAuthData> {
    let cleanCode = code.trim();
    if (cleanCode.includes('code=')) {
      try {
        const parsedUrl = new URL(
          cleanCode.startsWith('http')
            ? cleanCode
            : `https://platform.claude.com/${cleanCode}`,
        );
        cleanCode = parsedUrl.searchParams.get('code') || cleanCode;
      } catch {
        const match = cleanCode.match(/[?&]code=([^&#]+)/);
        if (match) cleanCode = match[1];
      }
    } else if (cleanCode.includes('#')) {
      cleanCode = cleanCode.split('#')[0];
    }

    const payload: Record<string, any> = {
      grant_type: 'authorization_code',
      client_id: this.CLAUDE_CODE_CLIENT_ID,
      code: cleanCode,
      redirect_uri: redirectUri || 'https://platform.claude.com/oauth/code/callback',
      code_verifier: codeVerifier,
    };
    if (state) {
      payload.state = state;
    }

    const tokenEndpoints = [
      'https://api.anthropic.com/v1/oauth/token',
      'https://platform.claude.com/v1/oauth/token',
    ];

    let lastError: any = null;
    let data: any = null;

    for (const endpoint of tokenEndpoints) {
      try {
        const response = await axios.post(endpoint, payload, {
          headers: { 'content-type': 'application/json' },
          timeout: 25_000,
        });
        if (response.data?.access_token) {
          data = response.data;
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!data) {
      throw lastError || new Error('Failed to exchange Claude authorization code');
    }

    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 86400;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + expiresInSec * 1000,
      refreshTokenExpiresAt: Date.now() + (data.refresh_token_expires_in || 30 * 86400) * 1000,
      scopes: data.scope ? data.scope.split(' ') : undefined,
    };
  }
}
