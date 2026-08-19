/**
 * API key storage policy (PROJECT_SPEC §7 / AGENTS.md §5):
 * - default: sessionStorage (cleared when the tab closes)
 * - only when the user explicitly opts in: localStorage
 * Keys are NEVER placed in URLs, console logs, or git.
 */

const SESSION_PREFIX = "surge-lan-console.key.session.";
const LOCAL_PREFIX = "surge-lan-console.key.local.";

export function saveApiKey(
  connectionId: string,
  apiKey: string,
  remember: boolean,
): void {
  const target = remember ? LOCAL_PREFIX : SESSION_PREFIX;
  const source = remember ? SESSION_PREFIX : LOCAL_PREFIX;
  try {
    localStorage.removeItem(source + connectionId);
    sessionStorage.removeItem(source + connectionId);
    (remember ? localStorage : sessionStorage).setItem(target + connectionId, apiKey);
  } catch {
    // storage unavailable (e.g. private mode) — connection will prompt for a key
  }
}

export function loadApiKey(connectionId: string): string | null {
  try {
    return (
      localStorage.getItem(LOCAL_PREFIX + connectionId) ??
      sessionStorage.getItem(SESSION_PREFIX + connectionId)
    );
  } catch {
    return null;
  }
}

export function clearApiKey(connectionId: string): void {
  try {
    localStorage.removeItem(LOCAL_PREFIX + connectionId);
    sessionStorage.removeItem(SESSION_PREFIX + connectionId);
  } catch {
    /* ignore */
  }
}

/** Whether a key for this connection is remembered in localStorage. */
export function isApiKeyRemembered(connectionId: string): boolean {
  try {
    return localStorage.getItem(LOCAL_PREFIX + connectionId) !== null;
  } catch {
    return false;
  }
}
