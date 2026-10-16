import { Article } from "../../../lib/src/models";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db } from "../db";
import { deleteArticleStorage, init } from "../sync/storage";
import { buildProxiedUrl, getCorsProxyValue, safeLocalStorage } from "../net/corsProxy";
import { getFilePathMetadata, getFilePathThumbnail } from "../../../lib/src/lib";
import { markDirty } from "./publicExport";
import { recordLog, errorMessage } from "../logging";
import { createFetchGovernor, GovernorError } from "../net/fetchGovernor";
import { createDexieOutcomeStore } from "../net/fetchGovernorStore";
import {
  countProxiedRequest,
  createProxyHealthMonitor,
  getProxiedRequestsToday,
  probeProxy,
} from "../net/proxyHealth";

/**
 * Whether the CORS proxy itself is working (#86). Fed by the governor below;
 * the UI subscribes to it for the banner, Preferences and Diagnostics.
 */
export const proxyHealth = createProxyHealthMonitor({
  probe: () =>
    probeProxy(getCorsProxyValue(), {
      fetch: (url, init) => {
        countProxiedRequest(safeLocalStorage(), Date.now());
        return fetch(url, init);
      },
      isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    }),
});

/** Requests this device sent to the CORS proxy today (a hint, not a quota). */
export function getProxiedRequestsTodayCount(): number {
  return getProxiedRequestsToday(safeLocalStorage(), Date.now());
}

// One governor for the whole app: all proxied fetches (article pages and every
// article image) share the same failure history, so a URL that is failing is
// not hammered from several code paths at once. Persisted in Dexie, so it also
// survives reloads.
const fetchGovernor = createFetchGovernor({
  store: createDexieOutcomeStore(),
  // Direct fetches (no proxy configured) have no proxy to blame: a site's own
  // 429 backs off that URL only.
  diagnoseProxy: async () => (getCorsProxyValue() ? proxyHealth.diagnose() : false),
  onEvent: (event) => {
    if (event.type === "recorded") {
      recordLog("warn", "fetch", `Fetch failed (${event.class})`, {
        key: event.key,
        status: event.status,
        attempts: event.attempts,
        nextAttemptAt: new Date(event.nextAttemptAt).toISOString(),
      });
    } else if (event.type === "breaker-open") {
      recordLog("warn", "fetch", "CORS proxy circuit breaker opened", {
        reason: event.reason,
        status: event.status,
        retryAt: new Date(event.nextAttemptAt).toISOString(),
        probe: proxyHealth.getState().lastProbe,
      });
    } else if (event.type === "breaker-close") {
      proxyHealth.reportHealthy();
    }
  },
});

/**
 * Start over after the proxy setting changed: close the breaker and forget
 * what was observed about the previous proxy.
 */
export function resetProxyHealth(): void {
  fetchGovernor.resetBreaker();
  proxyHealth.reset();
}

// delete the article from the db and the file system
// deleteArticleStorage already handles deleting from both IndexedDB and RemoteStorage
export async function removeArticle(slug: string): Promise<void> {
  await deleteArticleStorage(slug);
  markDirty();
}

// Update only the given fields of an article. This merges over the latest
// record in Dexie rather than writing a whole article object captured
// earlier — so concurrent writers (scroll-progress saver, archive button,
// summarizer, incoming sync) can't clobber each other's fields with stale
// copies.
export async function patchArticleMetadata(
  storeClient: BaseClient,
  slug: string,
  patch: Partial<Article>,
  options?: { skipPublicExport?: boolean }
): Promise<Article> {
  const merged = await db.transaction("rw", db.articles, async () => {
    const current = await db.articles.get(slug);
    if (!current) {
      throw new Error(`Article not found: ${slug}`);
    }
    const updated = { ...current, ...patch };
    await db.articles.put(updated);
    return updated;
  });

  await storeClient.storeFile(
    "application/json",
    getFilePathMetadata(slug),
    JSON.stringify(merged)
  );

  if (!options?.skipPublicExport) {
    markDirty();
  }

  return merged;
}

/**
 * Error thrown by fetchWithTimeout. Carries the resolved request URL (proxy
 * included) and the HTTP status when the browser exposed one.
 *
 * Limitation: when a cross-origin response fails the CORS check (no
 * Access-Control-Allow-Origin header), the browser filters the response before
 * JS ever sees it — fetch rejects with a bare TypeError and the status is not
 * observable (`status` stays undefined, even though the server may have
 * replied, e.g. 429). That is a browser security boundary; the status is only
 * available when the response carries CORS headers.
 */
/**
 * Forget the fetch governor's failure history. Call before an explicit user
 * retry (e.g. "Refetch") so URLs sitting in a backoff window are attempted
 * again instead of being skipped.
 */
export async function clearFetchFailures(): Promise<void> {
  await fetchGovernor.clearAll();
}

export class FetchError extends Error {
  readonly requestUrl: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { requestUrl: string; status?: number; cause?: unknown }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "FetchError";
    this.requestUrl = options.requestUrl;
    this.status = options.status;
  }
}

export async function fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
  // When a proxy is set it uses a prefix style URL (path or query token, then
  // `?url=...`), so the target must be encoded; without one, fetch directly.
  const fetchUrl = buildProxiedUrl(url);

  try {
    // The governor coalesces concurrent calls, skips URLs in their backoff
    // window, and short-circuits when the proxy itself is failing.
    const response = await fetchGovernor.run(
      { key: url, requestUrl: fetchUrl },
      async (requestUrl) => {
        const proxied = requestUrl !== url;
        if (proxied) countProxiedRequest(safeLocalStorage(), Date.now());
        const response = await fetch(requestUrl, { signal: AbortSignal.timeout(timeoutMs) });
        // Any status we can read came back through the proxy with CORS
        // headers, so the proxy is working (a 429 is handled by the breaker).
        if (proxied && response.status !== 429) proxyHealth.reportHealthy();
        return response;
      }
    );
    if (!response.ok) {
      throw new FetchError(`HTTP ${response.status} ${response.statusText}`.trim(), {
        requestUrl: fetchUrl,
        status: response.status,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    if (error instanceof GovernorError) {
      // The governor refused to spend a request (known-bad URL, backoff, or an
      // open circuit breaker). Surface it with the same shape as any other
      // fetch failure so callers keep working.
      throw new FetchError(error.message, {
        requestUrl: fetchUrl,
        status: error.status,
        cause: error,
      });
    }
    if ((error as Error).name === "TimeoutError") {
      throw new FetchError("Request timed out.", {
        requestUrl: fetchUrl,
        cause: error,
      });
    }
    // Network-layer failure. If the response failed the CORS check the browser
    // hides the status; preserve the request URL so it can be inspected.
    throw new FetchError(`Network error: ${(error as Error).message}`, {
      requestUrl: fetchUrl,
      cause: error,
    });
  }
}

export async function imageToDataUrl(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error("Failed to read blob as data URL"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return dataUrl;
}

// export function extractImageUrls(html: string, baseUrl: string): string[] {
//   if (typeof window === "undefined") {
//     return [];
//   }

//   const parser = new DOMParser();
//   const doc = parser.parseFromString(html, "text/html");
//   return (
//     Array.from(doc.querySelectorAll("img"))
//       .map((img) => img.getAttribute("src") || "")
//       // Skip empty and data URLs
//       .filter((src) => src && !src.startsWith("data:"))
//       .map((src) => {
//         try {
//           return new URL(src, baseUrl).href;
//         } catch {
//           return "";
//         }
//       })
//       .filter((u) => u)
//   );
// }

export async function loadThumbnail(slug: string): Promise<string> {
  try {
    // Try to load the thumbnail from storage
    const storage = await init();
    if (storage && storage.client) {
      const thumbnailPath = getFilePathThumbnail(slug);
      // Use local cache only for fast thumbnail loading
      const file = (await storage.client.getFile(thumbnailPath, false)) as { data: string };

      if (file && file.data) {
        return file.data;
      }
    }
  } catch (error) {
    console.warn(`Failed to load thumbnail for ${slug}:`, error);
    recordLog("warn", "thumbnail", `Failed to load thumbnail for ${slug}`, {
      slug,
      error: errorMessage(error),
    });
  }

  // Fallback to static image
  return "/static/article_bw.webp";
}
