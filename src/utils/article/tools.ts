import { Article } from "../../../lib/src/models";
import { getDefaultCorsProxy } from "~/config/environment";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db } from "../db";
import { deleteArticleStorage, init } from "../sync/storage";
import { getCorsProxyFromCookie, setCorsProxyInCookie } from "../cookies";
import { getFilePathMetadata, getFilePathThumbnail } from "../../../lib/src/lib";
import { resizeImage } from "../../../lib/src/ingestion";
import { markDirty } from "./publicExport";
import { recordLog, errorMessage } from "../logging";

// Cookie-based CORS proxy functions
export const getCorsProxyValue = (): string => {
  const customValue = getCorsProxyFromCookie();
  return customValue || getDefaultCorsProxy();
};

export const setCorsProxyValue = (value: string | null): void => {
  setCorsProxyInCookie(value);
};

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
  const corsProxy = getCorsProxyValue();
  // When a proxy is set it uses a query-parameter style URL (?url=...), so
  // the target must be encoded. When no proxy is set, use the URL as-is.
  const fetchUrl = corsProxy ? `${corsProxy}${encodeURIComponent(url)}` : url;

  try {
    const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(timeoutMs) });
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

export async function fetchAndResizeImage(
  url: string,
  maxDimension: number
): Promise<{ blob: Blob; width: number; height: number }> {
  // TODO: create error if fetch times out. this happens if you are offline. this may work now, not sure.
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error(`Expected image content type, got: ${contentType}`);
  }

  const blob = await response.blob();

  const { blob: resizedBlob, width, height } = await resizeImage(blob, maxDimension);

  return { blob: resizedBlob, width, height };
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
