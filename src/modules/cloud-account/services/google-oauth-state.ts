/**
 * In-memory registry of Google OAuth `state` values this process has issued.
 *
 * The Google consent flow returns the exact `state` string it was given in the
 * redirect back to the callback. Without binding that state to an authorization
 * we issued, a local process could craft a callback URL and hand us an
 * authorization code of its own. The state store lets the callback reject any
 * redirect whose `state` this server never produced.
 */
const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map<string, number>();

export function registerGoogleOAuthState(state: string): void {
  pruneExpiredStates();
  states.set(state, Date.now());
}

/**
 * Returns true once for a state this process issued and that has not expired,
 * consuming it so a single authorization code can only be used once. States
 * generated for a different redirect target are never accepted.
 */
export function consumeGoogleOAuthState(
  state: string | null | undefined,
): boolean {
  if (!state) {
    return false;
  }
  const createdAt = states.get(state);
  if (createdAt === undefined) {
    return false;
  }
  states.delete(state);
  return Date.now() - createdAt <= STATE_TTL_MS;
}

function pruneExpiredStates(): void {
  const now = Date.now();
  for (const [state, createdAt] of states) {
    if (now - createdAt > STATE_TTL_MS) {
      states.delete(state);
    }
  }
}
