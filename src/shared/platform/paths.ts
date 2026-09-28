import path from 'path';
import os from 'os';

export function getAgentDir(): string {
  return process.env.DATA_DIR || path.join(os.homedir(), '.antigravity-proxy');
}

export function getProxyStateDir(): string {
  return path.join(getAgentDir(), 'proxy-state');
}
