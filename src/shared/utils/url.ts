export function isValidProxyUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'socks:', 'socks4:', 'socks5:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
