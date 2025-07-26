import { Article, ArticleAndRender } from "../../lib/src/models";
import { getDefaultCorsProxy } from "~/config/environment";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db } from "./db";
import { deleteArticleStorage, glob, init } from "./storage";
import { getCorsProxyFromCookie, setCorsProxyInCookie } from "./cookies";
import { getFilePathMetadata, getFilePathThumbnail } from "../../lib/src/lib";
import { maxDimensionImage, resizeImage } from "../../lib/src/ingestion";

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

  // for (const file of await glob(storeClient, `saves/${slug}/*`)) {
  //   console.log("Deleting file", file);
  //   const result = await storeClient.remove(file);
  //   console.log("result", result);

  //   console.log("deleting non existing file test");
  //   const result2 = await storeClient.remove("bad-file");
  //   console.log("result2", result2);

  //   storeClient
  //     .remove(file)
  //     .then(() => console.log("result3 File/object deleted!"))
  //     .catch((err) => console.error(err));
  // }

  // delete the directory. is this needed?
  // storeClient.remove(`saves/${slug}`);

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

export async function fetchAndResizeImage(
  url: string,
  maxDimension: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const corsProxy = getCorsProxyValue();

  // TODO: create error if fetch times out. this happens if you are offline
  const response = await fetch(`${corsProxy}${url}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error(`Expected image content type, got: ${contentType}`);
  }

  const blob = await response.blob();

  const { blob: resizedBlob, width, height } = await resizeImage(blob, maxDimension);

  // const dataUrl = await imageToDataUrl(resizedBlob);

  // const dataUrl: string = await new Promise<string>((resolve, reject) => {
  //   const reader = new FileReader();
  //   reader.onloadend = () => {
  //     if (reader.result) {
  //       resolve(reader.result as string);
  //     } else {
  //       reject(new Error("Failed to read blob as data URL"));
  //     }
  //   };
  //   reader.onerror = reject;
  //   reader.readAsDataURL(resizedBlob);
  // });

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
      console.log("thumbnailPath", thumbnailPath);
      const file = (await storage.client.getFile(thumbnailPath)) as { data: string };
      console.log("thumb file", file);
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

//   public async downloadAndResizeImage(url: string, targetDir: string) {
//     const maxDimension = 200;
//     const filePath = url.split("/").pop();
//     const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;

//     // // Download the image
//     // const response = await fetch(url);
//     // const buffer = await response.arrayBuffer();

//     // // Get the image type from the response headers
//     // const imageType = response.headers.get('Content-Type').split('/')[1];

//     // // Resize the image to a maximum dimension
//     // const resizedImage = await ImageManipulator.manipulateAsync(buffer, [
//     //   {
//     //     resize: {
//     //       width: maxDimension,
//     //       height: maxDimension,
//     //     },
//     //   },
//     // ]);

//     // // Save the image to the SAF
//     // const file = await SAF.createFileAsync(
//     //  `${this.directory}/${targetDir}`,
//     //    filePath,
//     //   `image/${imageType}`,
//     // );
//     // await FileSystem.writeAsStringAsync(file, resizedImage.base64, {
//     //   encoding: 'base64',
//     // });

//     // return file.uri;
//   }
// }

// export class FileManagerWeb extends FileManager {
//   public directory: string;

//   public async downloadAndResizeImage(url: string, targetDir: string) {
//     const maxDimension = 200;
//     const filePath = url.split("/").pop();
//     const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;
//   }
