import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Transform, TransformCallback } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import { CloudAccount } from '@/modules/cloud-account/types';
import { AnthropicChatRequest } from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';
import { normalizeAnthropicOfficialModel } from '../anthropic/anthropic-model-helper';
import {
  UpstreamAuthError,
  UpstreamExecutionResult,
  UpstreamRateLimitError,
  UpstreamRequestFailedError,
} from '../upstream.types';

@Injectable()
export class ClaudeWebUpstreamService {
  private readonly logger = new Logger(ClaudeWebUpstreamService.name);
  private readonly baseUrl = 'https://claude.ai/api';

  /**
   * Execute messages using Claude.ai web session cookie (sessionKey=sk-ant-sid01-...)
   */
  public async executeMessages(
    req: AnthropicChatRequest,
    account: CloudAccount,
  ): Promise<UpstreamExecutionResult> {
    const sessionKey = account.session_key || account.api_key;
    if (!sessionKey) {
      throw new UpstreamAuthError('anthropic_web', account.id, 'No sessionKey found on account');
    }

    const orgId = await this.ensureOrganizationId(account, sessionKey);
    const conversationId = uuidv4();
    const headers = this.buildHeaders(sessionKey);

    // 1. Create temporary conversation
    try {
      await axios.post(
        `${this.baseUrl}/organizations/${orgId}/chat_conversations`,
        { uuid: conversationId, name: '' },
        { headers, timeout: 15_000 },
      );
    } catch (err) {
      this.logger.warn(`Failed to create conversation for web session: ${account.id}`, err);
    }

    // 2. Format prompt text from Anthropic request messages
    const prompt = this.formatMessagesToPrompt(req);
    const model = normalizeAnthropicOfficialModel(req.model);

    const completionPayload = {
      prompt,
      timezone: 'UTC',
      model,
      attachments: [],
      files: [],
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/organizations/${orgId}/chat_conversations/${conversationId}/completion`,
        completionPayload,
        {
          headers,
          responseType: 'stream',
          timeout: 120_000,
        },
      );

      // Transform Claude.ai web stream to standard Anthropic SSE stream
      const transformer = new ClaudeWebToAnthropicStreamTransformer(model);
      const transformedStream = response.data.pipe(transformer);

      // Async cleanup conversation after stream ends
      transformedStream.on('end', () => {
        axios
          .delete(`${this.baseUrl}/organizations/${orgId}/chat_conversations/${conversationId}`, {
            headers,
            timeout: 10_000,
          })
          .catch(() => {
            // Ignore delete error
          });
      });

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
            'anthropic_web',
            account.id,
            120_000,
            'Claude.ai web session rate limit or usage cap reached',
          );
        }

        if (status === 401 || status === 403) {
          throw new UpstreamAuthError(
            'anthropic_web',
            account.id,
            `Claude.ai session key expired or unauthorized (Status: ${status})`,
          );
        }

        throw new UpstreamRequestFailedError(
          'anthropic_web',
          account.id,
          status ?? 500,
          data,
          `Claude.ai web error: ${err.message}`,
        );
      }
      throw err;
    }
  }

  private async ensureOrganizationId(account: CloudAccount, sessionKey: string): Promise<string> {
    if (account.organization_id) {
      return account.organization_id;
    }

    try {
      this.logger.log(`Fetching Claude.ai organizations for account ${account.id}...`);
      const response = await axios.get(`${this.baseUrl}/organizations`, {
        headers: this.buildHeaders(sessionKey),
        timeout: 15_000,
      });

      const orgs = response.data;
      if (Array.isArray(orgs) && orgs.length > 0 && orgs[0]?.uuid) {
        account.organization_id = orgs[0].uuid;
        this.logger.log(`Resolved Claude.ai organization ID: ${account.organization_id}`);
        return account.organization_id;
      }
    } catch (err) {
      this.logger.error(`Failed to fetch Claude.ai organization ID for account ${account.id}`, err);
    }

    throw new UpstreamAuthError('anthropic_web', account.id, 'Failed to resolve Claude.ai organization ID');
  }

  private buildHeaders(sessionKey: string): Record<string, string> {
    const cookie = sessionKey.startsWith('sessionKey=') ? sessionKey : `sessionKey=${sessionKey}`;
    return {
      'content-type': 'application/json',
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      Accept: 'text/event-stream, text/plain, */*',
    };
  }

  private formatMessagesToPrompt(req: AnthropicChatRequest): string {
    const parts: string[] = [];
    if (req.system) {
      const sys = typeof req.system === 'string' ? req.system : JSON.stringify(req.system);
      parts.push(`Human: System Instructions:\n${sys}\n`);
    }

    for (const msg of req.messages || []) {
      const rolePrefix = msg.role === 'assistant' ? 'Assistant: ' : 'Human: ';
      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n');
      }
      parts.push(`${rolePrefix}${text}`);
    }

    parts.push('Assistant: ');
    return parts.join('\n\n');
  }
}

class ClaudeWebToAnthropicStreamTransformer extends Transform {
  private buffer = '';
  private messageId: string;
  private model: string;
  private hasStarted = false;
  private contentBlockIndex = 0;
  private totalOutputTokens = 0;
  private lastCompletionText = '';

  constructor(model: string) {
    super({ objectMode: false });
    this.model = model;
    this.messageId = `msg_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString('utf-8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) {
        continue;
      }

      const dataStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(dataStr);
        this.handleEvent(parsed);
      } catch {
        // Ignore partial JSON
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    this.emitStopEvents();
    callback();
  }

  private handleEvent(data: any): void {
    if (!this.hasStarted) {
      this.hasStarted = true;
      this.pushEvent('message_start', {
        type: 'message_start',
        message: {
          id: this.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: this.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });

      this.pushEvent('content_block_start', {
        type: 'content_block_start',
        index: this.contentBlockIndex,
        content_block: { type: 'text', text: '' },
      });
    }

    // Claude web emits completion strings (sometimes cumulative or diff)
    if (typeof data.completion === 'string') {
      const fullText = data.completion;
      const deltaText = fullText.startsWith(this.lastCompletionText)
        ? fullText.slice(this.lastCompletionText.length)
        : fullText;
      this.lastCompletionText = fullText;

      if (deltaText) {
        this.totalOutputTokens += Math.max(1, Math.ceil(deltaText.length / 4));
        this.pushEvent('content_block_delta', {
          type: 'content_block_delta',
          index: this.contentBlockIndex,
          delta: {
            type: 'text_delta',
            text: deltaText,
          },
        });
      }
    }

    if (data.stop_reason) {
      this.emitStopEvents();
    }
  }

  private emitStopEvents(): void {
    if (!this.hasStarted) return;
    this.hasStarted = false;

    this.pushEvent('content_block_stop', {
      type: 'content_block_stop',
      index: this.contentBlockIndex,
    });

    this.pushEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: this.totalOutputTokens },
    });

    this.pushEvent('message_stop', {
      type: 'message_stop',
    });
  }

  private pushEvent(eventType: string, data: unknown): void {
    this.push(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
