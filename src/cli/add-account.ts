import 'dotenv/config';
import http from 'node:http';
import { exec } from 'node:child_process';
import { GoogleAPIService } from '../modules/cloud-account/services/GoogleAPIService';
import { jsonAccountStoreInstance } from '../modules/proxy-gateway/server/modules/account-lease/adapters/json-account.store';
import { CloudAccount } from '../modules/cloud-account/types';
import { logger } from '../shared/logging/logger';
import { tCli, setCliLanguage, type CliLanguage } from './i18n';

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
  throw new Error(tCli('addAccount.cannotOpenPort', { ports: ALLOWED_PORTS.join(', ') }));
}

async function handleNonGoogleAccount(provider: string, args: string[]) {
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const email = getArg('--email') || `${provider}-${Date.now()}@antigravity.proxy`;
  const key = getArg('--key');
  const session = getArg('--session');
  const token = getArg('--token');

  let account: CloudAccount;
  const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (provider === 'anthropic' || provider === 'claude') {
    if (session) {
      account = {
        id,
        provider: 'anthropic',
        auth_type: 'web_session',
        email,
        session_key: session,
        created_at: Date.now(),
        last_used: Date.now(),
        health: {},
      };
      console.log(`\nAdding Claude.ai Web Session account (${email})...`);
    } else if (key) {
      account = {
        id,
        provider: 'anthropic',
        auth_type: 'api_key',
        email,
        api_key: key,
        created_at: Date.now(),
        last_used: Date.now(),
        health: {},
      };
      console.log(`\nAdding Anthropic API Key account (${email})...`);
    } else {
      console.error('Error: Please provide --key <sk-ant-api03-...> or --session <sk-ant-sid01-...>');
      process.exit(1);
    }
  } else if (provider === 'copilot') {
    if (!token && !key) {
      console.error('Error: Please provide GitHub Copilot token with --token <ghu_...>');
      process.exit(1);
    }
    account = {
      id,
      provider: 'copilot',
      auth_type: 'copilot_token',
      email,
      github_token: token || key,
      created_at: Date.now(),
      last_used: Date.now(),
      health: {},
    };
    console.log(`\nAdding GitHub Copilot account (${email})...`);
  } else if (provider === 'openai' || provider === 'codex') {
    if (!key && !token) {
      console.error('Error: Please provide OpenAI API key with --key <sk-...>');
      process.exit(1);
    }
    account = {
      id,
      provider: 'openai',
      auth_type: 'api_key',
      email,
      api_key: key || token,
      created_at: Date.now(),
      last_used: Date.now(),
      health: {},
    };
    console.log(`\nAdding OpenAI API account (${email})...`);
  } else {
    console.error(`Unknown provider: ${provider}. Supported: google, anthropic, copilot, openai`);
    process.exit(1);
  }

  await jsonAccountStoreInstance.upsertAccount(account);
  console.log('Account saved successfully to accounts.json!');
  const storedAccounts = await jsonAccountStoreInstance.getAccounts();
  console.log(`Total accounts in pool: ${storedAccounts.length}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const langIdx = args.indexOf('--lang');
  if (langIdx !== -1 && args[langIdx + 1]) {
    const l = args[langIdx + 1].toLowerCase() as CliLanguage;
    if (l === 'en' || l === 'vi') {
      setCliLanguage(l);
    }
  }

  console.log('\n======================================================');
  console.log(tCli('addAccount.banner'));
  console.log('======================================================\n');

  const providerIdx = args.indexOf('--provider');
  const providerArg = providerIdx !== -1 ? args[providerIdx + 1]?.toLowerCase() : undefined;

  if (providerArg && providerArg !== 'google') {
    await handleNonGoogleAccount(providerArg, args);
    return;
  }

  let serverInfo: { server: http.Server; port: number; redirectUri: string };
  try {
    serverInfo = await startServer();
  } catch (err: any) {
    console.error(tCli('addAccount.error', { message: err.message }));
    process.exit(1);
  }

  const { server, port, redirectUri } = serverInfo;
  const authUrl = GoogleAPIService.getAuthUrl(undefined, redirectUri);

  console.log(tCli('addAccount.listening', { uri: redirectUri }));
  console.log('\n' + tCli('addAccount.openLinkPrompt'));
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
                <h2 style="color: #10b981;">${tCli('addAccount.successHtmlTitle')}</h2>
                <p>${tCli('addAccount.successHtmlDesc')}</p>
              </body>
            </html>
          `);
        } else {
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 50px;">
                <h2 style="color: #ef4444;">${tCli('addAccount.failedHtmlTitle')}</h2>
                <p>${error || tCli('addAccount.failedHtmlDesc')}</p>
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
    console.error('\n' + tCli('addAccount.cancelledOrError', { message: error || 'Unknown error' }));
    process.exit(1);
  }

  console.log(tCli('addAccount.exchangingCode'));

  try {
    const tokens = await GoogleAPIService.exchangeCode(code, undefined, undefined, redirectUri);
    console.log(tCli('addAccount.tokenReceived'));

    let email = 'unknown@gmail.com';
    try {
      const userInfo = await GoogleAPIService.getUserInfo(tokens.access_token);
      if (userInfo.email) {
        email = userInfo.email;
      }
    } catch {
      logger.warn('Could not fetch user profile email via API, using default.');
    }

    let projectId = '';
    try {
      const projectContext = await GoogleAPIService.fetchProjectContext(tokens.access_token);
      projectId = projectContext.projectId || '';
    } catch {
      logger.warn('Could not auto-fetch project_id.');
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
      console.log(tCli('addAccount.syncingModels'));
      const quota = await GoogleAPIService.fetchQuota(tokens.access_token);
      newAccount.quota = quota;
      const modelCount = Object.keys(quota.models || {}).length;
      console.log(tCli('addAccount.modelsSynced', { count: modelCount }));
    } catch {
      logger.warn(tCli('addAccount.quotaWarning'));
    }

    await jsonAccountStoreInstance.upsertAccount(newAccount);

    if (existingIndex !== -1) {
      console.log(`\n` + tCli('addAccount.accountUpdated', { email, id: accountId }));
    } else {
      console.log(`\n` + tCli('addAccount.accountAdded'));
    }

    console.log('======================================================');
    console.log(tCli('addAccount.summaryEmail', { email }));
    console.log(tCli('addAccount.summaryId', { id: accountId }));
    console.log(tCli('addAccount.summaryProject', { project: projectId || tCli('addAccount.noProject') }));
    console.log(tCli('addAccount.summarySaved'));
    const storedAccounts = await jsonAccountStoreInstance.getAccounts();
    console.log(tCli('addAccount.summaryTotal', { count: storedAccounts.length }));
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('\n' + tCli('addAccount.error', { message: err.message || err }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
