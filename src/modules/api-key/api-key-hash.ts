import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Only the SHA-256 digest of a client API key is ever stored. A stolen
 * `data/antigravity.sqlite` therefore yields no usable key, which matters because that
 * same file also holds the traffic audit log.
 *
 * SHA-256 rather than bcrypt/argon2: a generated key is 192 bits of `randomBytes`
 * output, so the input space is already far beyond a brute-force search and a slow KDF
 * would buy nothing while adding its cost to every proxied request. Operator-supplied
 * custom keys are the one case where the input could be guessable, which is what
 * MIN_CUSTOM_KEY_LENGTH defends.
 */
export const MIN_CUSTOM_KEY_LENGTH = 16;

/** Hex length of a SHA-256 digest; the width of the `keyHash` column. */
export const API_KEY_HASH_LENGTH = 64;

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/**
 * Compare two hex digests without leaking, through timing, how many leading characters
 * matched. Lookups keyed by digest need no such care -- a map hit reveals only the hash
 * of the value the caller already supplied -- but comparing the master key does.
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== API_KEY_HASH_LENGTH) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * The only form of a key that outlives its creation: enough to tell two keys apart in a
 * list, not enough to authenticate with.
 */
export function previewApiKey(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 12) {
    return "****";
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

/** Generate a fresh key: 24 random bytes (192 bits) as 48 hex characters. */
export function generateApiKey(): string {
  return `sk-ag-${randomBytes(24).toString("hex")}`;
}
