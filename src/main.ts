// Must be the first import: it disables redirect-following on the shared axios
// defaults before any module creates its own axios instance.
import '@/shared/http/axios-hardening';
import 'dotenv/config';
import { MIN_CUSTOM_KEY_LENGTH } from './modules/api-key/api-key-hash';
import { DEFAULT_APP_CONFIG, ProxyConfig } from './modules/config/types';
import { bootstrapNestServer, stopNestServer } from './server/main';
import { logger } from './shared/logging/logger';

async function run() {
  const port = parseInt(process.env.PORT || '8045', 10);
  const apiKey = process.env.PROXY_API_KEY || '';

  const trimmedMasterKey = apiKey.trim();
  if (trimmedMasterKey && trimmedMasterKey.length < MIN_CUSTOM_KEY_LENGTH) {
    logger.error(
      `PROXY_API_KEY is set but shorter than ${MIN_CUSTOM_KEY_LENGTH} characters. ` +
        `The proxy has no rate limiting, so a short master key is guessable by brute ` +
        `force. Set a key of at least ${MIN_CUSTOM_KEY_LENGTH} characters and restart.`,
    );
    process.exit(1);
  }

  const config: ProxyConfig = {
    ...DEFAULT_APP_CONFIG.proxy,
    enabled: true,
    port,
    api_key: apiKey,
    auto_start: true,
  };

  logger.info(`Starting LLM Gateway Proxy Standalone on port ${port}...`);
  if (apiKey) {
    logger.info(`Master API Key protection enabled via .env.`);
  } else {
    logger.info(
      `No master PROXY_API_KEY in .env. Using dynamic API keys from SQLite database (or Open Mode if none exist).`,
    );
  }

  const result = await bootstrapNestServer(config);

  if (result.success) {
    console.log(`\n======================================================`);
    console.log(
      `🚀 LLM Gateway Proxy is RUNNING on http://0.0.0.0:${result.port}`,
    );
    console.log(`======================================================`);
    console.log(`Supported endpoints:`);
    console.log(`  • Web UI:    http://localhost:${result.port}/`);
    console.log(
      `  • OpenAI:    http://localhost:${result.port}/v1/chat/completions`,
    );
    console.log(`  • OpenAI:    http://localhost:${result.port}/v1/models`);
    console.log(`  • Anthropic: http://localhost:${result.port}/v1/messages`);
    console.log(
      `  • Gemini:    http://localhost:${result.port}/v1beta/models/...`,
    );
    console.log(`\nUse this with Cursor, Claude Code, Cline, OpenCode, etc.`);
    console.log(`======================================================\n`);
  } else {
    const errorMsg = 'message' in result ? result.message : 'Unknown error';
    logger.error(`Failed to start proxy server: ${errorMsg}`);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down LLM Gateway Proxy...`);
    await stopNestServer();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

run().catch((err) => {
  logger.error('Fatal error during startup:', err);
  process.exit(1);
});
