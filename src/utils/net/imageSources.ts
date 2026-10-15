import { fetchWithTimeout } from "~/utils/article/tools";
import { getCorsProxyValue, maskCorsProxyInText } from "./corsProxy";
import { errorMessage } from "~/utils/logging";

/**
 * Something that can download an article image. Ingest tries its sources in
 * order — e.g. the browser extension first, then the proxy/direct fetch — so a
 * broken or slow source only costs a fallback, never the save.
 *
 * `label` names the downloader in the article's fetch log and the Diagnostics
 * log: `extension <version>`, `proxy <hostname>` or `direct`. It must never
 * contain a proxy token.
 */
export interface ImageSource {
  readonly label: string;
  fetchImage(url: string): Promise<Blob>;
}

export interface DownloadAttempt {
  source: string;
  ok: boolean;
  error?: string;
}

/** Every source failed; `attempts` holds the full chain for the logs. */
export class ImageDownloadError extends Error {
  readonly attempts: DownloadAttempt[];
  readonly cause: unknown;

  constructor(attempts: DownloadAttempt[], cause: unknown) {
    super(attempts[attempts.length - 1]?.error ?? "No image source available");
    this.name = "ImageDownloadError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** Try each source in order; the first to supply the bytes wins. */
export async function downloadImage(
  url: string,
  sources: ImageSource[]
): Promise<{ blob: Blob; source: string; attempts: DownloadAttempt[] }> {
  const attempts: DownloadAttempt[] = [];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const blob = await source.fetchImage(url);
      attempts.push({ source: source.label, ok: true });
      return { blob, source: source.label, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        source: source.label,
        ok: false,
        error: maskCorsProxyInText(errorMessage(error)),
      });
    }
  }
  throw new ImageDownloadError(attempts, lastError);
}

/** `extension 1.0.0 failed (timed out) -> proxy p.example ok` */
export function formatAttempts(attempts: DownloadAttempt[]): string {
  return attempts
    .map((attempt) =>
      attempt.ok ? `${attempt.source} ok` : `${attempt.source} failed (${attempt.error})`
    )
    .join(" -> ");
}

/**
 * The downloader name for the proxy setting: `direct` without one, otherwise
 * `proxy <hostname>`. Only the hostname is kept — the path, query, and any
 * credentials can carry the secret token.
 */
export function proxyDownloaderLabel(proxy: string): string {
  if (!proxy) return "direct";
  try {
    return `proxy ${new URL(proxy).hostname}`;
  } catch {
    return "proxy (unparsable)";
  }
}

/** The default source: the configured CORS proxy, or a direct fetch. */
export function proxyImageSource(proxy: string = getCorsProxyValue()): ImageSource {
  return {
    label: proxyDownloaderLabel(proxy),
    async fetchImage(url: string): Promise<Blob> {
      const response = await fetchWithTimeout(url);
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        throw new Error(`Expected image content type, got: ${contentType}`);
      }
      return response.blob();
    },
  };
}
