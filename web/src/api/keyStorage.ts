/**
 * Where the admin/master key lives in the browser.
 *
 * `sessionStorage` (not `localStorage`) is used deliberately: the key survives
 * reloads within the tab but is dropped when the tab closes and never written to
 * disk by the browser. It also dies the moment a logout is requested, because the
 * dashboard offers one.
 */
const ADMIN_KEY_STORAGE = 'antigravity_admin_key';

export function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}
