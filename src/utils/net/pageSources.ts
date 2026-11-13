import { fetchWithTimeout } from "~/utils/article/tools";
import { getCorsProxyValue, maskCorsProxyInText } from "./corsProxy";
import { proxyDownloaderLabel, type DownloadAttempt } from "./imageSources";
import { errorMessage } from "~/utils/logging";

/**
 * Something that can download the article page itself for a URL save — the
 * page-level twin of `ImageSource`. Ingest tries its sources in order (the
 * browser extension first when one is detected, then the proxy/direct fetch),
 * so a missing permission or a slow extension only costs a fallback.
 *
 * `label` names the downloader in the logs (`extension <version>`,
 * `proxy <hostname>`, `direct`) and must never contain a proxy token.
 */
export interface PageSource {
  readonly label: string;
  fetchPage(url: string): Promise<Response>;
}

/**
 * Every source failed. `cause` is the last source's error — normally the
 * proxy/direct fetch's `FetchError` — so callers keep its request URL and
 * status for their logs and messages.
 */
export class PageDownloadError extends Error {
  readonly attempts: DownloadAttempt[];
  readonly cause: unknown;

  constructor(attempts: DownloadAttempt[], cause: unknown) {
    super(attempts[attempts.length - 1]?.error ?? "No page source available");
    this.name = "PageDownloadError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** Try each source in order; the first to return the page wins. */
export async function downloadPage(
  url: string,
  sources: PageSource[]
): Promise<{ response: Response; source: string; attempts: DownloadAttempt[] }> {
  const attempts: DownloadAttempt[] = [];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const response = await source.fetchPage(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      attempts.push({ source: source.label, ok: true });
      return { response, source: source.label, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        source: source.label,
        ok: false,
        error: maskCorsProxyInText(errorMessage(error)),
      });
    }
  }
  throw new PageDownloadError(attempts, lastError);
}

/** The default source: the configured CORS proxy, or a direct fetch. */
export function proxyPageSource(proxy: string = getCorsProxyValue()): PageSource {
  return {
    label: proxyDownloaderLabel(proxy),
    fetchPage: (url: string) => fetchWithTimeout(url),
  };
}
