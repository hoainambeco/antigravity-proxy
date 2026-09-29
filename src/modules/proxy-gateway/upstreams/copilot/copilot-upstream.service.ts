import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { CloudAccount } from '@/modules/cloud-account/types';
import { OpenAIChatRequest } from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';
import { CopilotTokenService } from './copilot-token.service';
import {
  UpstreamAuthError,
  UpstreamExecutionResult,
  UpstreamRateLimitError,
  UpstreamRequestFailedError,
} from '../upstream.types';

@Injectable()
export class CopilotUpstreamService {
  private readonly logger = new Logger(CopilotUpstreamService.name);

  constructor(
    @Inject(CopilotTokenService)
    private readonly copilotTokenService: CopilotTokenService,
  ) {}

  public async executeChatCompletions(
    req: OpenAIChatRequest,
    account: CloudAccount,
  ): Promise<UpstreamExecutionResult> {
    const isStream = Boolean(req.stream);
    const tokenInfo = await this.copilotTokenService.getCopilotToken(account);
    const url = `${tokenInfo.apiEndpoint}/chat/completions`;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      Authorization: `Bearer ${tokenInfo.token}`,
      'Editor-Version': 'vscode/1.98.0',
      'Editor-Plugin-Version': 'copilot-chat/0.24.0',
      'User-Agent': 'GitHubCopilotChat/0.24.0',
      'Copilot-Integration-Id': 'vscode-chat',
      'Openai-Intent': 'conversation-panel',
    };

    const sanitizedBody = this.sanitizeCopilotRequest(req);

    try {
      if (isStream) {
        const response = await axios.post(url, sanitizedBody, {
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
        const response = await axios.post(url, sanitizedBody, {
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
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;

        // If Copilot token is rejected with 401, invalidate cached token
        if (status === 401) {
          this.copilotTokenService.invalidateToken(account.id);
        }

        if (status === 429) {
          throw new UpstreamRateLimitError(
            'copilot',
            account.id,
            60_000,
            'Copilot rate limit exceeded (429)',
          );
        }

        if (status === 401 || status === 403) {
          throw new UpstreamAuthError(
            'copilot',
            account.id,
            `Copilot auth failed (${status}): ${JSON.stringify(data)}`,
          );
        }

        throw new UpstreamRequestFailedError(
          'copilot',
          account.id,
          status ?? 500,
          data,
          `Copilot upstream error: ${err.message}`,
        );
      }
      throw err;
    }
  }

  private sanitizeCopilotRequest(req: OpenAIChatRequest): Record<string, unknown> {
    let model = req.model || 'gpt-4o';
    // Copilot naming normalization
    if (model.includes('claude-3-7-sonnet')) {
      model = 'claude-3.7-sonnet';
    } else if (model.includes('claude-3-5-sonnet')) {
      model = 'claude-3.5-sonnet';
    }

    return {
      ...req,
      model,
    };
  }
}
