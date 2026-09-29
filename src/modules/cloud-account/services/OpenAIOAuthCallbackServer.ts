import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import http from 'node:http';
import { AccountLeaseService } from '../../proxy-gateway/server/modules/account-lease/account-lease.service';
import { OAuthProviderLoginService } from './OAuthProviderLoginService';

const OAUTH_HOST = '127.0.0.1';
const ALLOWED_PORTS = [8081, 8082, 8083, 8084, 8085];
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8081/auth/callback';
const ACTIVE_REDIRECT_URI = { current: DEFAULT_REDIRECT_URI };

function buildCallbackHtml(
  title: string,
  message: string,
  ok: boolean,
): string {
  const color = ok ? '#10b981' : '#ef4444';
  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #e4e4e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 40px 48px; max-width: 460px; text-align: center; }
      h2 { margin-top: 0; color: ${color}; }
      p { color: #a1a1aa; line-height: 1.6; word-break: break-word; }
      code { background: #27272a; padding: 2px 6px; border-radius: 6px; font-size: 12px; color: #e4e4e7; user-select: all; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 20px; background: ${color}; color: #09090b; border-radius: 10px; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${title}</h2>
      <p>${message}</p>
      <a class="btn" href="http://localhost:8045/accounts">Quay lại Dashboard</a>
    </div>
  </body>
</html>`;
}

@Injectable()
export class OpenAIOAuthCallbackServer
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OpenAIOAuthCallbackServer.name);
  private server: http.Server | null = null;
  private boundPort: number | null = null;

  public static getDefaultRedirectUri(): string {
    return ACTIVE_REDIRECT_URI.current;
  }

  constructor(private readonly accountLeaseService: AccountLeaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.start();
    } catch (err) {
      this.logger.warn(
        `OpenAI OAuth callback listener could not start: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  getRedirectUri(): string {
    return ACTIVE_REDIRECT_URI.current;
  }

  async start(): Promise<void> {
    for (const port of ALLOWED_PORTS) {
      try {
        const server = http.createServer((req, res) => {
          void this.handleRequest(req, res);
        });
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, OAUTH_HOST, () => resolve());
        });
        this.server = server;
        this.boundPort = port;
        ACTIVE_REDIRECT_URI.current = `http://${OAUTH_HOST}:${port}/auth/callback`;
        this.logger.log(
          `OpenAI OAuth callback listener started at ${ACTIVE_REDIRECT_URI.current}`,
        );
        return;
      } catch {
        // Port in use, try next
      }
    }
    throw new Error(
      `Không thể mở cổng callback OpenAI trên các cổng: ${ALLOWED_PORTS.join(', ')}`,
    );
  }

  async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
      this.boundPort = null;
    }
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(
      req.url || '/',
      `http://${OAUTH_HOST}:${this.boundPort ?? 8081}`,
    );

    if (url.pathname !== '/auth/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const code = url.searchParams.get('code') || undefined;
    const state = url.searchParams.get('state') || undefined;
    const error = url.searchParams.get('error') || undefined;
    const errorDescription =
      url.searchParams.get('error_description') || undefined;

    if (error || !code || !state) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildCallbackHtml(
          'Đăng nhập OpenAI thất bại',
          `Không nhận được mã xác thực: <code>${errorDescription || error || 'Thiếu mã code'}</code>`,
          false,
        ),
      );
      return;
    }

    const pending = OAuthProviderLoginService.consumeOpenAiState(state);
    if (!pending) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildCallbackHtml(
          'Đăng nhập OpenAI thất bại',
          'Trạng thái OAuth không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
          false,
        ),
      );
      return;
    }

    try {
      const account = await OAuthProviderLoginService.exchangeAndSaveOpenAiAccount({
        code,
        codeVerifier: pending.codeVerifier,
        redirectUri: pending.redirectUri,
      });
      await this.accountLeaseService.loadAccounts();
      this.logger.log(`OpenAI OAuth callback succeeded for ${account.email}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildCallbackHtml(
          'Thành công!',
          `Tài khoản <strong>${account.email}</strong> đã được thêm thành công qua OpenAI OAuth. Bạn có thể đóng cửa sổ này.`,
          true,
        ),
      );
    } catch (err) {
      this.logger.error('OpenAI OAuth callback exchange failed', err);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildCallbackHtml(
          'Xảy ra lỗi',
          err instanceof Error ? err.message : String(err),
          false,
        ),
      );
    }
  }
}
