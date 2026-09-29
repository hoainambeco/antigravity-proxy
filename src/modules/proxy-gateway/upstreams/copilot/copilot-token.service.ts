import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount } from '@/modules/cloud-account/types';
import { UpstreamAuthError } from '../upstream.types';

export interface CopilotCachedToken {
  token: string;
  expiresAt: number;
  apiEndpoint: string;
}

@Injectable()
export class CopilotTokenService {
  private readonly logger = new Logger(CopilotTokenService.name);
  private readonly tokenCache = new Map<string, CopilotCachedToken>();

  /**
   * Retrieves a valid Copilot session token for the given account,
   * refreshing it via GitHub internal API if expired or nearing expiration.
   */
  public async getCopilotToken(account: CloudAccount): Promise<CopilotCachedToken> {
    const cached = this.tokenCache.get(account.id);
    const now = Math.floor(Date.now() / 1000);

    // If token exists and valid for at least 60 more seconds, return cached
    if (cached && cached.expiresAt > now + 60) {
      return cached;
    }

    const githubToken = account.github_token || account.api_key || account.token?.access_token;
    if (!githubToken) {
      throw new UpstreamAuthError('copilot', account.id, 'No GitHub token (ghu_ / gho_) found on account');
    }

    try {
      this.logger.log(`Exchanging GitHub token for Copilot session token (Account: ${account.id})...`);
      const response = await axios.get('https://api.github.com/copilot_internal/v2/token', {
        headers: {
          Authorization: `token ${githubToken}`,
          'Editor-Version': 'vscode/1.98.0',
          'Editor-Plugin-Version': 'copilot-chat/0.24.0',
          'User-Agent': 'GitHubCopilotChat/0.24.0',
          Accept: 'application/json',
        },
        timeout: 15_000,
      });

      const data = response.data;
      if (!data?.token) {
        throw new Error('Invalid token response from GitHub Copilot token endpoint');
      }

      const result: CopilotCachedToken = {
        token: data.token,
        expiresAt: typeof data.expires_at === 'number' ? data.expires_at : now + 1800,
        apiEndpoint: data.endpoints?.api || 'https://api.githubcopilot.com',
      };

      this.tokenCache.set(account.id, result);
      // Also update account record
      account.copilot_token = result.token;
      account.copilot_token_expires_at = result.expiresAt;

      this.logger.log(`Obtained Copilot session token for account ${account.id}, expires at ${new Date(result.expiresAt * 1000).toISOString()}`);
      return result;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        this.logger.error(`GitHub Copilot token exchange failed (Status: ${status}): ${err.message}`);
        if (status === 401 || status === 403) {
          throw new UpstreamAuthError('copilot', account.id, `Invalid or unauthorized GitHub token: ${err.message}`);
        }
      }
      throw err;
    }
  }

  public invalidateToken(accountId: string): void {
    this.tokenCache.delete(accountId);
  }
}
