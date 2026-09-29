import { Readable } from 'node:stream';

export interface UpstreamExecutionResult {
  isStream: boolean;
  stream?: NodeJS.ReadableStream | Readable;
  data?: unknown;
  headers?: Record<string, string | string[]>;
  status: number;
}

export class UpstreamRateLimitError extends Error {
  public readonly isRateLimit = true;
  constructor(
    public readonly provider: string,
    public readonly accountId: string,
    public readonly retryAfterMs: number = 60_000,
    message: string = 'Upstream provider rate limited or overloaded (429/529)',
  ) {
    super(message);
    this.name = 'UpstreamRateLimitError';
  }
}

export class UpstreamAuthError extends Error {
  public readonly isAuthError = true;
  constructor(
    public readonly provider: string,
    public readonly accountId: string,
    message: string = 'Upstream provider authentication failed (401/403)',
  ) {
    super(message);
    this.name = 'UpstreamAuthError';
  }
}

export class UpstreamRequestFailedError extends Error {
  constructor(
    public readonly provider: string,
    public readonly accountId: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
    message?: string,
  ) {
    super(message || `Upstream request failed with status ${statusCode}`);
    this.name = 'UpstreamRequestFailedError';
  }
}
