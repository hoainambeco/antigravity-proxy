import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount } from '@/modules/cloud-account/types';
import { jsonAccountStoreInstance } from '@/modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';

export interface OpenAiOAuthData {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  expiresAt: number;
  refreshTokenExpiresAt?: number;
  scopes?: string[];
}

@Injectable()
export class OpenAIOAuthRefresher {
  private static readonly logger = new Logger(OpenAIOAuthRefresher.name);
  public static readonly TOKEN_URL = 'https://auth.openai.com/oauth/token';
  public static readonly CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

  public static shouldRefresh(account: CloudAccount): boolean {
    const expiresAt =
      (account as any).openai_oauth?.expiresAt ||
      (account.token?.expiry_timestamp ? account.token.expiry_timestamp * 1000 : undefined);

    if (!expiresAt) {
      return false;
    }

    // Refresh if expiring in less than 5 minutes (300_000 ms) or already expired
    return Date.now() >= expiresAt - 300_000;
  }

  public static async refreshAccessToken(account: CloudAccount): Promise<boolean> {
    const refreshToken =
      (account as any).openai_oauth?.refreshToken ||
      (account as any).tokens?.refresh_token ||
      account.token?.refresh_token;

    if (!refreshToken) {
      return false;
    }

    try {
      this.logger.log(`Refreshing OpenAI OAuth access token for account ${account.id}...`);
      const response = await axios.post(
        this.TOKEN_URL,
        {
          client_id: this.CODEX_CLIENT_ID,
          grant_type: 'refresh_token',
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
        const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 864_000;

        const newRefreshToken = data.refresh_token || refreshToken;
        const newExpiresAt = Date.now() + expiresInSec * 1000;

        if (!(account as any).openai_oauth) {
          (account as any).openai_oauth = {
            accessToken: data.access_token,
            refreshToken: newRefreshToken,
            idToken: data.id_token,
            expiresAt: newExpiresAt,
            scopes: typeof data.scope === 'string' ? data.scope.split(' ') : undefined,
          };
        } else {
          (account as any).openai_oauth.accessToken = data.access_token;
          (account as any).openai_oauth.refreshToken = newRefreshToken;
          if (data.id_token) (account as any).openai_oauth.idToken = data.id_token;
          (account as any).openai_oauth.expiresAt = newExpiresAt;
        }

        if ((account as any).tokens) {
          (account as any).tokens.access_token = data.access_token;
          (account as any).tokens.refresh_token = newRefreshToken;
          if (data.id_token) (account as any).tokens.id_token = data.id_token;
        }

        if (!account.token) {
          account.token = {
            access_token: data.access_token,
            refresh_token: newRefreshToken,
            expires_in: expiresInSec,
            expiry_timestamp: Math.floor(newExpiresAt / 1000),
            token_type: 'Bearer',
          };
        } else {
          account.token.access_token = data.access_token;
          account.token.refresh_token = newRefreshToken;
          account.token.expires_in = expiresInSec;
          account.token.expiry_timestamp = Math.floor(newExpiresAt / 1000);
        }

        // Auto-persist refreshed token to accounts.json
        void jsonAccountStoreInstance.upsertAccount(account).catch(() => {});
        this.logger.log(`Successfully refreshed OpenAI OAuth token for account ${account.id}`);
        return true;
      }
    } catch (err) {
      this.logger.error(`Failed to refresh OpenAI OAuth token for account ${account.id}`, err);
    }

    return false;
  }

  public static async exchangeAuthorizationCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OpenAiOAuthData> {
    let cleanCode = code.trim();
    if (cleanCode.includes('code=')) {
      try {
        const parsedUrl = new URL(
          cleanCode.startsWith('http')
            ? cleanCode
            : `https://auth.openai.com/${cleanCode}`,
        );
        cleanCode = parsedUrl.searchParams.get('code') || cleanCode;
      } catch {
        const match = cleanCode.match(/[?&]code=([^&#]+)/);
        if (match) cleanCode = match[1];
      }
    } else if (cleanCode.includes('#')) {
      cleanCode = cleanCode.split('#')[0];
    }

    const payload = {
      grant_type: 'authorization_code',
      client_id: this.CODEX_CLIENT_ID,
      code: cleanCode,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    };

    const response = await axios.post(this.TOKEN_URL, payload, {
      headers: { 'content-type': 'application/json' },
      timeout: 25_000,
    });

    const data = response.data;
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 864_000;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresAt: Date.now() + expiresInSec * 1000,
      scopes: typeof data.scope === 'string' ? data.scope.split(' ') : undefined,
    };
  }
}
