import { environmentConfig } from "~/config/environment";

/**
 * The user's CORS proxy setting.
 *
 * This used to be a cookie (`savr-cors-proxy`), which meant the proxy URL —
 * including any secret token in it — was sent to Savr's own host on every
 * request. It now lives in localStorage, so the token only ever travels to
 * the proxy itself. An existing cookie value is migrated on first read and
 * the cookie is deleted.
 */
export const CORS_PROXY_STORAGE_KEY = "savr-cors-proxy";

/** Pre-localStorage cookie; read once for migration, then removed. */
export const LEGACY_CORS_PROXY_COOKIE_NAME = "savr-cors-proxy";

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`, "i");
const UUID_GLOBAL_RE = new RegExp(UUID_SOURCE, "gi");

export const REDACTED = "[redacted]";

/** How to deploy a private, token-locked copy of the proxy worker (#84). */
export const SELF_HOST_PROXY_URL =
  "https://github.com/jonocodes/savr/tree/main/infra/cors-worker#deploy-your-own-token-locked";

/** localStorage, or null where it is missing or access throws. */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Access can throw in some privacy modes.
    return null;
  }
}

function readLegacyCookie(): string | null {
  if (typeof document === "undefined" || typeof document.cookie !== "string") return null;
  const prefix = `${LEGACY_CORS_PROXY_COOKIE_NAME}=`;
  const pair = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));
  if (!pair) return null;
  const raw = pair.slice(prefix.length).trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return raw || null;
  }
}

function clearLegacyCookie(): void {
  if (typeof document === "undefined" || typeof document.cookie !== "string") return;
  document.cookie = `${LEGACY_CORS_PROXY_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/** The explicitly configured proxy, or null when the default is in use. */
export function getStoredCorsProxy(): string | null {
  const store = safeLocalStorage();
  if (!store) return readLegacyCookie();

  const stored = store.getItem(CORS_PROXY_STORAGE_KEY);
  if (stored) return stored;

  // One-time migration from the old cookie.
  const legacy = readLegacyCookie();
  if (legacy) {
    try {
      store.setItem(CORS_PROXY_STORAGE_KEY, legacy);
    } catch {
      // Storage unavailable; still clear the cookie so it stops being sent.
    }
    clearLegacyCookie();
    return legacy;
  }
  return null;
}

export function setStoredCorsProxy(value: string | null): void {
  const trimmed = value?.trim() || null;
  const store = safeLocalStorage();
  if (store) {
    try {
      if (trimmed) store.setItem(CORS_PROXY_STORAGE_KEY, trimmed);
      else store.removeItem(CORS_PROXY_STORAGE_KEY);
    } catch {
      // Ignore: a failed write just means the default stays in effect.
    }
  }
  // Never leave a stale cookie (with a token) being sent to Savr's host.
  clearLegacyCookie();
}

/** The active proxy prefix: the configured value, else the build-time default. */
export function getCorsProxyValue(): string {
  return getStoredCorsProxy() || environmentConfig.defaultCorsProxy || "";
}

export function setCorsProxyValue(value: string | null): void {
  setStoredCorsProxy(value);
}

/**
 * The URL actually fetched: the proxy is a prefix and the target is
 * `encodeURIComponent`-encoded after it, so both supported proxy shapes work
 * without any other app change:
 *
 *   https://proxy.example/<token>/?url=<encoded>
 *   https://proxy.example/?token=<token>&url=<encoded>
 *
 * With no proxy configured the target is fetched directly.
 */
export function buildProxiedUrl(
  targetUrl: string,
  proxy: string = getCorsProxyValue()
): string {
  return proxy ? `${proxy}${encodeURIComponent(targetUrl)}` : targetUrl;
}

/**
 * Every secret-looking substring in a proxy value:
 *  - the value of a `token=` query parameter,
 *  - UUIDs in the path (`https://proxy.example/<uuid>/?url=`) or anywhere.
 */
function tokenCandidates(proxy: string): string[] {
  const candidates = new Set<string>();
  const value = proxy.trim();
  if (!value) return [];

  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get("token");
    if (queryToken) candidates.add(queryToken);
    for (const segment of url.pathname.split("/")) {
      const decoded = (() => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })();
      if (UUID_RE.test(decoded)) candidates.add(decoded);
    }
  } catch {
    // Not a URL; fall through to the UUID scan.
  }

  for (const match of value.matchAll(UUID_GLOBAL_RE)) candidates.add(match[0]);
  return [...candidates];
}

let cachedCandidates: { proxy: string; candidates: string[] } | null = null;

function currentTokenCandidates(): string[] {
  const proxy = getCorsProxyValue();
  if (!cachedCandidates || cachedCandidates.proxy !== proxy) {
    cachedCandidates = { proxy, candidates: tokenCandidates(proxy) };
  }
  return cachedCandidates.candidates;
}

/**
 * Mask the proxy token wherever it appears in `text` — log meta, failure
 * reports, the Diagnostics dump. Without a configured token this is a no-op
 * (the public default proxy has nothing to hide). Callers should mask whole
 * diagnostic payloads rather than trusting individual fields.
 */
export function maskCorsProxyInText(text: string): string {
  if (!text) return text;
  let masked = text;
  for (const token of currentTokenCandidates()) {
    masked = masked.split(token).join(REDACTED);
  }
  return masked;
}
