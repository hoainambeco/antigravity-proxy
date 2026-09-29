import { Transform, TransformCallback } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';

export class OpenAIToAnthropicStreamTransformer extends Transform {
  private buffer = '';
  private messageId: string;
  private model: string;
  private hasStarted = false;
  private contentBlockIndex = 0;
  private totalOutputTokens = 0;

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
      if (dataStr === '[DONE]') {
        this.emitStopEvents();
        continue;
      }

      try {
        const parsed = JSON.parse(dataStr);
        this.handleOpenAIDelta(parsed);
      } catch {
        // Ignore partial chunks or malformed JSON
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.buffer.trim().startsWith('data:')) {
      const dataStr = this.buffer.trim().slice(5).trim();
      if (dataStr === '[DONE]') {
        this.emitStopEvents();
      } else {
        try {
          const parsed = JSON.parse(dataStr);
          this.handleOpenAIDelta(parsed);
          this.emitStopEvents();
        } catch {
          // Ignore
        }
      }
    } else {
      this.emitStopEvents();
    }
    callback();
  }

  private handleOpenAIDelta(data: any): void {
    const choice = data.choices?.[0];
    if (!choice) return;

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

    const deltaContent = choice.delta?.content;
    if (deltaContent) {
      this.totalOutputTokens += Math.max(1, Math.ceil(deltaContent.length / 4));
      this.pushEvent('content_block_delta', {
        type: 'content_block_delta',
        index: this.contentBlockIndex,
        delta: {
          type: 'text_delta',
          text: deltaContent,
        },
      });
    }
  }

  private emitStopEvents(): void {
    if (!this.hasStarted) return;
    this.hasStarted = false; // only emit once

    this.pushEvent('content_block_stop', {
      type: 'content_block_stop',
      index: this.contentBlockIndex,
    });

    this.pushEvent('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        output_tokens: this.totalOutputTokens,
      },
    });

    this.pushEvent('message_stop', {
      type: 'message_stop',
    });
  }

  private pushEvent(eventType: string, data: unknown): void {
    this.push(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
