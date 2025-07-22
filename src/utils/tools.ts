import { Article, ArticleAndRender } from "../../lib/src/models";
import { getDefaultCorsProxy } from "~/config/environment";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { db } from "./db";
import { deleteArticleStorage, glob } from "./storage";
import { getCorsProxyFromCookie, setCorsProxyInCookie } from "./cookies";
import { getFilePathMetadata } from "../../lib/src/lib";

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
