import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount } from '@/modules/cloud-account/types';
import { OpenAIChatRequest } from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';
import { OpenAIOAuthRefresher } from './openai-oauth-refresher';
import {
  UpstreamAuthError,
  UpstreamExecutionResult,
  UpstreamRateLimitError,
  UpstreamRequestFailedError,
} from '../upstream.types';

@Injectable()
export class OpenAIUpstreamService {
  private readonly logger = new Logger(OpenAIUpstreamService.name);
  private readonly baseUrl = 'https://api.openai.com/v1';

  /**
   * Execute chat completions request against official OpenAI API
   */
  public async executeChatCompletions(
    req: OpenAIChatRequest,
    account: CloudAccount,
  ): Promise<UpstreamExecutionResult> {
    if (OpenAIOAuthRefresher.shouldRefresh(account)) {
      await OpenAIOAuthRefresher.refreshAccessToken(account);
    }

    const isStream = Boolean(req.stream);
    const url = `${this.baseUrl}/chat/completions`;
    const headers = this.buildHeaders(account);

    try {
      if (isStream) {
        const response = await axios.post(url, req, {
          headers,
          responseType: 'stream',
          timeout: 120_000,
        });

        return {
          isStream: true,
          stream: response.data,
          status: response.status,
          headers: response.headers as Record<string, string | string[]>,
        };
      } else {
        const response = await axios.post(url, req, {
          headers,
          timeout: 120_000,
        });

        return {
          isStream: false,
          data: response.data,
          status: response.status,
          headers: response.headers as Record<string, string | string[]>,
        };
      }
    } catch (err: unknown) {
      this.handleAxiosError(err, account, 'openai-chat-completions');
    }
  }

  private buildHeaders(account: CloudAccount): Record<string, string> {
    const apiKey = account.api_key || account.token?.access_token;
    if (!apiKey) {
      throw new UpstreamAuthError('openai', account.id, 'No OpenAI API key found on account');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    if (account.organization_id) {
      headers['OpenAI-Organization'] = account.organization_id;
    }

    return headers;
  }

  private handleAxiosError(err: unknown, account: CloudAccount, operation: string): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      const retryAfterHeader = err.response?.headers?.['retry-after'];
      let retryAfterMs = 60_000;

      if (retryAfterHeader) {
        const parsed = Number(retryAfterHeader);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterMs = parsed * 1000;
        }
      }

      this.logger.warn(`OpenAI [${operation}] failed (Status: ${status}, Account: ${account.id})`);

      if (status === 429) {
        throw new UpstreamRateLimitError(
          'openai',
          account.id,
          retryAfterMs,
          `OpenAI rate limit or quota exceeded: status 429`,
        );
      }

      if (status === 401 || status === 403) {
        throw new UpstreamAuthError(
          'openai',
          account.id,
          `OpenAI auth failed (${status}): ${JSON.stringify(data)}`,
        );
      }

      throw new UpstreamRequestFailedError(
        'openai',
        account.id,
        status ?? 500,
        data,
        `OpenAI upstream error: ${err.message}`,
      );
    }

    throw err as Error;
  }
}
