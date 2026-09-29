import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Transform, TransformCallback } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import { CloudAccount } from '@/modules/cloud-account/types';
import { OpenAIChatRequest } from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';
import { OpenAIOAuthRefresher } from '../openai/openai-oauth-refresher';
import {
  UpstreamAuthError,
  UpstreamExecutionResult,
  UpstreamRateLimitError,
  UpstreamRequestFailedError,
} from '../upstream.types';

@Injectable()
export class ChatGPTWebUpstreamService {
  private readonly logger = new Logger(ChatGPTWebUpstreamService.name);
  private readonly baseUrl = 'https://chatgpt.com/backend-api';

  public async executeChatCompletions(
    req: OpenAIChatRequest,
    account: CloudAccount,
  ): Promise<UpstreamExecutionResult> {
    if (OpenAIOAuthRefresher.shouldRefresh(account)) {
      await OpenAIOAuthRefresher.refreshAccessToken(account);
    }

    const accessToken = account.token?.access_token || account.api_key;
    if (!accessToken) {
      throw new UpstreamAuthError('chatgpt_web', account.id, 'No access token found on ChatGPT web account');
    }

    const url = `${this.baseUrl}/conversation`;
    const accountId = account.account_id || (account as any).tokens?.account_id;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'codex_cli_rs/0.153.4',
      Accept: 'text/event-stream',
    };

    if (accountId) {
      headers['ChatGPT-Account-ID'] = accountId;
    }

    const userPrompt = this.extractLastUserMessage(req);
    const model = this.normalizeModel(req.model);

    const body = {
      action: 'next',
      messages: [
        {
          id: uuidv4(),
          author: { role: 'user' },
          content: { content_type: 'text', parts: [userPrompt] },
        },
      ],
      parent_message_id: uuidv4(),
      model,
      timezone_offset_min: -420,
      history_and_training_disabled: true,
    };

    try {
      const response = await axios.post(url, body, {
        headers,
        responseType: 'stream',
        timeout: 120_000,
      });

      const transformer = new ChatGPTWebToOpenAIStreamTransformer(req.model || 'gpt-4o');
      const transformedStream = response.data.pipe(transformer);

      return {
        isStream: true,
        stream: transformedStream,
        status: response.status,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;

        if (status === 429) {
          throw new UpstreamRateLimitError(
            'chatgpt_web',
            account.id,
            120_000,
            'ChatGPT web rate limit reached',
          );
        }

        if (status === 401 || status === 403) {
          throw new UpstreamAuthError(
            'chatgpt_web',
            account.id,
            `ChatGPT web session unauthorized or token expired (${status})`,
          );
        }

        throw new UpstreamRequestFailedError(
          'chatgpt_web',
          account.id,
          status ?? 500,
          data,
          `ChatGPT web error: ${err.message}`,
        );
      }
      throw err;
    }
  }

  private extractLastUserMessage(req: OpenAIChatRequest): string {
    const messages = req.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((c: any) => (c.type === 'text' ? c.text : ''))
            .join('\n');
        }
      }
    }
    return '';
  }

  private normalizeModel(model?: string): string {
    if (!model) return 'auto';
    if (model.includes('gpt-4o-mini')) return 'gpt-4o-mini';
    if (model.includes('gpt-4o')) return 'gpt-4o';
    if (model.includes('o1')) return 'o1';
    if (model.includes('o3')) return 'o3-mini';
    return 'auto';
  }
}

class ChatGPTWebToOpenAIStreamTransformer extends Transform {
  private buffer = '';
  private completionId: string;
  private model: string;
  private lastText = '';

  constructor(model: string) {
    super({ objectMode: false });
    this.model = model;
    this.completionId = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString('utf-8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') {
        this.push('data: [DONE]\n\n');
        continue;
      }

      try {
        const parsed = JSON.parse(dataStr);
        const parts = parsed.message?.content?.parts;
        if (Array.isArray(parts) && parts.length > 0 && typeof parts[0] === 'string') {
          const currentText = parts[0];
          const delta = currentText.startsWith(this.lastText)
            ? currentText.slice(this.lastText.length)
            : currentText;
          this.lastText = currentText;

          if (delta) {
            const chunkPayload = {
              id: this.completionId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: this.model,
              choices: [
                {
                  index: 0,
                  delta: { content: delta },
                  finish_reason: null,
                },
              ],
            };
            this.push(`data: ${JSON.stringify(chunkPayload)}\n\n`);
          }
        }
      } catch {
        // Ignore partial chunks
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    this.push('data: [DONE]\n\n');
    callback();
  }
}
