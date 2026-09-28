import 'dotenv/config';
import http from 'node:http';
import { exec } from 'node:child_process';
import { GoogleAPIService } from '../modules/cloud-account/services/GoogleAPIService';
import { jsonAccountStoreInstance } from '../modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';
import { CloudAccount } from '../modules/cloud-account/types';
import { logger } from '../shared/logging/logger';

const OAUTH_HOST = '127.0.0.1';
const ALLOWED_PORTS = [8888, 8889, 8890, 8891, 8892];

function openBrowser(url: string) {
  const startCmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  exec(`${startCmd} "${url}"`, () => {});
}

async function startServer(): Promise<{ server: http.Server; port: number; redirectUri: string }> {
  for (const port of ALLOWED_PORTS) {
    try {
      const server = http.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, OAUTH_HOST, () => resolve());
      });
      const redirectUri = `http://${OAUTH_HOST}:${port}/oauth-callback`;
      return { server, port, redirectUri };
    } catch {
      // Port in use, continue to next
    }
  }
  throw new Error(`Không thể mở cổng callback OAuth trên các cổng: ${ALLOWED_PORTS.join(', ')}`);
}

async function main() {
  console.log('\n======================================================');
  console.log('🔑 Antigravity Proxy - Thêm tài khoản Google Cloud');
  console.log('======================================================\n');

  let serverInfo: { server: http.Server; port: number; redirectUri: string };
  try {
    serverInfo = await startServer();
  } catch (err: any) {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  }

  const { server, port, redirectUri } = serverInfo;
  const authUrl = GoogleAPIService.getAuthUrl(undefined, redirectUri);

  console.log(`Đang lắng nghe OAuth callback tại: ${redirectUri}`);
  console.log('\n👉 Vui lòng mở đường link bên dưới trên trình duyệt để đăng nhập Google:\n');
  console.log(`\x1b[36m${authUrl}\x1b[0m\n`);

  openBrowser(authUrl);

  const authPromise = new Promise<{ code?: string; error?: string }>((resolve) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url || '', `http://${OAUTH_HOST}:${port}`);
      if (url.pathname === '/oauth-callback') {
        const code = url.searchParams.get('code') || undefined;
        const error = url.searchParams.get('error') || undefined;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (code) {
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 50px;">
                <h2 style="color: #10b981;">✅ Đăng nhập thành công!</h2>
                <p>Bạn có thể đóng tab này và quay lại Terminal.</p>
              </body>
            </html>
          `);
        } else {
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 50px;">
                <h2 style="color: #ef4444;">❌ Đăng nhập thất bại</h2>
                <p>${error || 'Không nhận được mã xác thực.'}</p>
              </body>
            </html>
          `);
        }

        resolve({ code, error });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
  });

  const { code, error } = await authPromise;
  server.close();

  if (error || !code) {
    console.error(`\n❌ Đăng nhập bị hủy hoặc gặp lỗi: ${error || 'Unknown error'}`);
    process.exit(1);
  }

  console.log('⏳ Đang trao đổi mã xác thực để lấy token...');

  try {
    const tokens = await GoogleAPIService.exchangeCode(code, undefined, undefined, redirectUri);
    console.log('✅ Đã nhận được access_token và refresh_token.');

    let email = 'unknown@gmail.com';
    try {
      const userInfo = await GoogleAPIService.getUserInfo(tokens.access_token);
      if (userInfo.email) {
        email = userInfo.email;
      }
    } catch {
      logger.warn('Không lấy được profile email qua API, sử dụng mặc định.');
    }

    let projectId = '';
    try {
      const projectContext = await GoogleAPIService.fetchProjectContext(tokens.access_token);
      projectId = projectContext.projectId || '';
    } catch {
      logger.warn('Không tự động lấy được project_id.');
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
        // Seconds, not milliseconds: the lease runtime compares this against
        // Math.floor(Date.now() / 1000) and rewrites it in seconds after a refresh.
        expiry_timestamp: Math.floor(Date.now() / 1000) + tokens.expires_in,
        token_type: tokens.token_type || 'Bearer',
        email,
        project_id: projectId || undefined,
      },
      health: {},
    };

    try {
      console.log('📡 Đang đồng bộ danh sách models và hạn mức từ Google Upstream...');
      const quota = await GoogleAPIService.fetchQuota(tokens.access_token);
      newAccount.quota = quota;
      const modelCount = Object.keys(quota.models || {}).length;
      console.log(`✅ Đã đồng bộ thành công ${modelCount} models khả dụng từ Google!`);
    } catch {
      logger.warn('Chưa lấy được quota ngay lúc này, hệ thống sẽ tự động đồng bộ khi chạy.');
    }

    await jsonAccountStoreInstance.upsertAccount(newAccount);

    if (existingIndex !== -1) {
      console.log(`\n🔄 Đã cập nhật token cho tài khoản có sẵn [${email}] (ID: ${accountId})`);
    } else {
      console.log(`\n🎉 Đã thêm tài khoản mới thành công!`);
    }

    console.log('======================================================');
    console.log(`📧 Email:      ${email}`);
    console.log(`🆔 Account ID: ${accountId}`);
    console.log(`📂 Project ID: ${projectId || '(chưa có hoặc chưa kích hoạt GCP)'}`);
    console.log(`💾 Đã lưu vào: accounts.json`);
    const storedAccounts = await jsonAccountStoreInstance.getAccounts();
    console.log(`📊 Tổng số tài khoản hiện tại: ${storedAccounts.length}`);
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('\n❌ Xảy ra lỗi trong quá trình xử lý token:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
