import { safeStringifyPacket } from '../security/sensitiveDataMasking';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (message: string, ...meta: unknown[]) => {
    const metaStr = meta.length > 0 ? ' ' + meta.map((m) => (typeof m === 'object' ? safeStringifyPacket(m) : m)).join(' ') : '';
    console.log(`[${formatTimestamp()}] [INFO] ${message}${metaStr}`);
  },
  warn: (message: string, ...meta: unknown[]) => {
    const metaStr = meta.length > 0 ? ' ' + meta.map((m) => (typeof m === 'object' ? safeStringifyPacket(m) : m)).join(' ') : '';
    console.warn(`[${formatTimestamp()}] [WARN] ${message}${metaStr}`);
  },
  error: (message: string, ...meta: unknown[]) => {
    const metaStr = meta.length > 0 ? ' ' + meta.map((m) => (typeof m === 'object' ? safeStringifyPacket(m) : m)).join(' ') : '';
    console.error(`[${formatTimestamp()}] [ERROR] ${message}${metaStr}`);
  },
  debug: (message: string, ...meta: unknown[]) => {
    if (process.env.DEBUG) {
      const metaStr = meta.length > 0 ? ' ' + meta.map((m) => (typeof m === 'object' ? safeStringifyPacket(m) : m)).join(' ') : '';
      console.debug(`[${formatTimestamp()}] [DEBUG] ${message}${metaStr}`);
    }
  },
  getRecentLogs: () => [],
};
