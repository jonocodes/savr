import { Article, ArticleAndRender } from "../../../lib/src/models";
import { getCorsProxy } from "~/config/environment";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db, DbType } from "./db";
import { glob } from "./storage";
import { getCorsProxyFromCookie, setCorsProxyInCookie } from "./cookies";


// Cookie-based CORS proxy functions
export const getCorsProxyValue = (): string | null => {
  return getCorsProxyFromCookie() || getCorsProxy();
};

export const setCorsProxyValue = (value: string | null): void => {
  setCorsProxyInCookie(value);
};


function getFilePathContent(slug: string): string {
  return `saves/${slug}/index.html`;
}

function getFilePathMetadata(slug: string): string {
  return `saves/${slug}/article.json`;
}

// delete the article from the db and the file system
export async function removeArticle(storeClient: BaseClient, slug: string): Promise<void> {
  // const files = await glob(storeClient, `saves/${slug}/*`);

  for (const file of await glob(storeClient, `saves/${slug}/*`)) {
    console.log("Deleting file", file);
    await storeClient.remove(file);
  }

  // delete the directory. is this needed?
  // storeClient.remove(`saves/${slug}`);

  // remove the article from the db
  await db.articles.delete(slug);
}

export async function updateArticleState(
  // db: DbType,
  storeClient: BaseClient,
  slug: string,
  state: string
): Promise<Article> {
  // const metadataPath = getFilePathMetadata(slug);

  // delete the directory if deleting. TODO: recursive
  // storeClient?.remove(`saves/${slug}/index.html`);

  // set the state in the file

  const article = await db.articles.get(slug);

  if (article === undefined) {
    throw new Error("article empty");
  }

  article.state = state;

  await storeClient.storeFile(
    "application/json",
    getFilePathMetadata(slug),
    JSON.stringify(article)
  );

  // set the state in the db

  await db.articles.put(article);

  return article;
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
