import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import http from 'node:http';
import { GoogleAPIService } from './GoogleAPIService';
import { jsonAccountStoreInstance } from '../../proxy-gateway/server/modules/account-lease/adapters/json-account.store';
import { AccountLeaseService } from '../../proxy-gateway/server/modules/account-lease/account-lease.service';
import type { CloudAccount } from '../types';

const OAUTH_HOST = '127.0.0.1';
const ALLOWED_PORTS = [8888, 8889, 8890, 8891, 8892];
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8888/oauth-callback';

function buildCallbackHtml(title: string, message: string, ok: boolean): string {
  const color = ok ? '#10b981' : '#ef4444';
  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #e4e4e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 40px 48px; max-width: 420px; text-align: center; }
      h2 { margin-top: 0; color: ${color}; }
      p { color: #a1a1aa; line-height: 1.6; }
      .btn { display: inline-block; margin-top: 12px; padding: 10px 20px; background: ${color}; color: #09090b; border-radius: 10px; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${title}</h2>
      <p>${message}</p>
      <a class="btn" href="http://localhost:8044/accounts">Quay lại Dashboard</a>
    </div>
  </body>
</html>`;
}

@Injectable()
export class OAuthCallbackServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OAuthCallbackServer.name);
  private server: http.Server | null = null;
  private boundPort: number | null = null;

  constructor(private readonly accountLeaseService: AccountLeaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.start();
    } catch (err) {
      this.logger.warn(`OAuth callback listener could not start: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  getRedirectUri(): string {
    return this.boundPort ? `http://${OAUTH_HOST}:${this.boundPort}/oauth-callback` : DEFAULT_REDIRECT_URI;
  }

  renderSuccess(email: string, accountId: string): string {
    return buildCallbackHtml(
      'Thành công!',
      `Tài khoản <strong>${email}</strong> (${accountId}) đã được thêm thành công.`,
      true,
    );
  }

  renderError(message: string): string {
    return buildCallbackHtml('Xảy ra lỗi', message, false);
  }

  async start(): Promise<void> {
    for (const port of ALLOWED_PORTS) {
      try {
        const server = http.createServer((req, res) => {
          this.handleRequest(req, res);
        });
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, OAUTH_HOST, () => resolve());
        });
        this.server = server;
        this.boundPort = port;
        this.logger.log(`OAuth callback listener started at http://${OAUTH_HOST}:${port}/oauth-callback`);
        return;
      } catch {
        // Port in use, try next
      }
    }
    throw new Error(`Không thể mở cổng callback OAuth trên các cổng: ${ALLOWED_PORTS.join(', ')}`);
  }

  async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
      this.boundPort = null;
    }
  }

  async saveOAuthAccount(code: string, redirectUri: string): Promise<CloudAccount> {
    const tokens = await GoogleAPIService.exchangeCode(
      code,
      undefined,
      undefined,
      redirectUri,
    );

    let email = 'unknown@gmail.com';
    try {
      const userInfo = await GoogleAPIService.getUserInfo(tokens.access_token);
      if (userInfo.email) {
        email = userInfo.email;
      }
    } catch {
      this.logger.warn('Could not fetch email profile; using default');
    }

    let projectId = '';
    try {
      const projectContext = await GoogleAPIService.fetchProjectContext(tokens.access_token);
      projectId = projectContext.projectId || '';
    } catch {
      this.logger.warn('Could not auto-fetch project context');
    }

    const accounts = await jsonAccountStoreInstance.getAccounts();
    const existingIndex = accounts.findIndex((a) => a.email === email);
    const accountId =
      existingIndex !== -1
        ? accounts[existingIndex].id
        : `acc-${Date.now().toString().slice(-4)}`;

    const newAccount: CloudAccount = {
      id: accountId,
      provider: 'google',
      email,
      created_at: Date.now(),
      last_used: Date.now(),
      token: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        expiry_timestamp: Math.floor(Date.now() / 1000) + tokens.expires_in,
        token_type: tokens.token_type || 'Bearer',
        email,
        project_id: projectId || undefined,
      },
      health: {},
    };

    try {
      const quota = await GoogleAPIService.fetchQuota(tokens.access_token);
      newAccount.quota = quota;
    } catch (quotaErr) {
      this.logger.warn('Initial quota fetch failed, will retry on background interval', quotaErr);
    }

    await jsonAccountStoreInstance.upsertAccount(newAccount);
    await this.accountLeaseService.reloadAllAccounts();

    return newAccount;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${OAUTH_HOST}:${this.boundPort ?? 8888}`);

    if (url.pathname !== '/oauth-callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const code = url.searchParams.get('code') || undefined;
    const error = url.searchParams.get('error') || undefined;

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildCallbackHtml(
          'Đăng nhập thất bại',
          `Không nhận được mã xác thực: ${error || 'Thiếu mã code'}`,
          false,
        ),
      );
      return;
    }

    const redirectUri = `http://${OAUTH_HOST}:${this.boundPort}/oauth-callback`;

    void (async () => {
      try {
        const account = await this.saveOAuthAccount(code, redirectUri);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          buildCallbackHtml(
            'Thành công!',
            `Tài khoản <strong>${account.email}</strong> (${account.id}) đã được thêm thành công.`,
            true,
          ),
        );
      } catch (err) {
        this.logger.error('OAuth callback failed', err);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          buildCallbackHtml(
            'Xảy ra lỗi',
            err instanceof Error ? err.message : String(err),
            false,
          ),
        );
      }
    })();
  }
}