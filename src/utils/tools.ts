import { Article, ArticleAndRender } from "../../lib/src/models";
import { getDefaultCorsProxy } from "~/config/environment";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db } from "./db";
import { deleteArticleStorage, glob, init } from "./storage";
import { getCorsProxyFromCookie, setCorsProxyInCookie } from "./cookies";
import { getFilePathMetadata, getFilePathThumbnail } from "../../lib/src/lib";
import { resizeImage } from "../../lib/src/ingestion";

// Cookie-based CORS proxy functions
export const getCorsProxyValue = (): string => {
  const customValue = getCorsProxyFromCookie();
  return customValue || getDefaultCorsProxy();
};

export const setCorsProxyValue = (value: string | null): void => {
  setCorsProxyInCookie(value);
};

// delete the article from the db and the file system
export async function removeArticle(storeClient: BaseClient, slug: string): Promise<void> {
  await deleteArticleStorage(slug);

  // remove the article from the db
  await db.articles.delete(slug);
}

export async function updateArticleMetadata(
  storeClient: BaseClient,
  updatedArticle: Article
): Promise<Article> {
  // update the metadata file in the storage

  await storeClient.storeFile(
    "application/json",
    getFilePathMetadata(updatedArticle.slug),
    JSON.stringify(updatedArticle)
  );

  // update the state in the db

  await db.articles.put(updatedArticle);

  return updatedArticle;
}

export async function fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
  try {
    const controller = new AbortController();
    const signal = AbortSignal.timeout(timeoutMs); // Automatically aborts after timeoutMs
    signal.addEventListener("abort", () => controller.abort()); // Link signals

    const corsProxy = getCorsProxyValue();

    console.log("fetching with timeout", `${corsProxy}${url}`);

    const response = await fetch(`${corsProxy}${url}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
    // return awaitresponse.json();
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      console.error("Fetch request timed out:", error);
      throw new Error("Request timed out.");
    } else {
      console.error("Fetch error:", error);
      throw error;
    }
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

export function extractImageUrls(html: string, baseUrl: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return (
    Array.from(doc.querySelectorAll("img"))
      .map((img) => img.getAttribute("src") || "")
      // Skip empty and data URLs
      .filter((src) => src && !src.startsWith("data:"))
      .map((src) => {
        try {
          return new URL(src, baseUrl).href;
        } catch {
          return "";
        }
      })
      .filter((u) => u)
  );
}

export async function loadThumbnail(slug: string): Promise<string> {
  try {
    // Try to load the thumbnail from storage
    const storage = await init();
    if (storage && storage.client) {
      const thumbnailPath = getFilePathThumbnail(slug);
      const file = (await storage.client.getFile(thumbnailPath)) as { data: string };

      if (file && file.data) {
        return file.data;
      }
    }
  } catch (error) {
    console.warn(`Failed to load thumbnail for ${slug}:`, error);
  }

  // Fallback to static image
  return "/static/article_bw.webp";
}
