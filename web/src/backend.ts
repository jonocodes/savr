import { dbFile, defaultData, dataDir, humanReadableSize, renderTemplate, toArticleAndRender, filterAndPrepareArticles } from "lib";
import { JSONFileSyncPreset } from "lowdb/node";
import { ArticleAndRender, Articles } from "./models";
import { version } from '../package.json' with { type: "json" };
import fs, { Dirent } from "fs";
import * as path from 'path';


export async function systemInfo() {

  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const sizeInBytes = await getDirectorySizeAsync(dataDir ?? "notfound");
  console.log(`Directory size: ${humanReadableSize(sizeInBytes)}`);

  const statusCounts: Record<string, number> = {};

  for (const article of db.data.articles) {
    const { state } = article;
    statusCounts[state] = (statusCounts[state] || 0) + 1;
  }

  const data = {
    version,
    size: humanReadableSize(sizeInBytes),
    articles: statusCounts,
  };

  return data;
}

export async function renderSystemInfo() {

  const info = await systemInfo();

  const view = {
    content: JSON.stringify(info, null, 2)
  };

  return renderTemplate("about", view);
}
export function getDirectorySizeAsync(dirPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    getDirectorySize(dirPath, (err, size) => {
      if (err) {
        return reject(err);
      }
      resolve(size || 0);
    });
  });
}



/**
 * Recursively calculates the size of a directory using a callback-based approach.
 * @param dirPath - The path of the directory.
 * @param callback - Callback to handle the result or error.
 */
export function getDirectorySize(
    dirPath: string,
    callback: (err: NodeJS.ErrnoException | null, size?: number) => void
  ): void {
    let totalSize = 0;
  
    fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        return callback(err);
      }
  
      if (!entries) {
        return callback(null, totalSize);
      }
  
      let pending = entries.length;
      if (pending === 0) {
        return callback(null, totalSize);
      }
  
      for (const entry of entries as Dirent[]) {
        const fullPath = path.join(dirPath, entry.name);
  
        if (entry.isDirectory()) {
          getDirectorySize(fullPath, (err, size) => {
            if (err) {
              return callback(err);
            }
            totalSize += size || 0;
            if (--pending === 0) {
              callback(null, totalSize);
            }
          });
        } else if (entry.isFile()) {
          fs.stat(fullPath, (err, stats) => {
            if (err) {
              return callback(err);
            }
            totalSize += stats.size;
            if (--pending === 0) {
              callback(null, totalSize);
            }
          });
        } else {
          if (--pending === 0) {
            callback(null, totalSize);
          }
        }
      }
    });
  }

export function getArticles(): ArticleAndRender[] {
  const db = JSONFileSyncPreset<Articles>(dbFile, defaultData);

  return filterAndPrepareArticles(db.data.articles)

//   const readable: ArticleAndRender[] = []

//   for (const article of db.data.articles) {

//     const articleAndRender = toArticleAndRender(article)

//     if (article.state != "deleted")
//       readable.push(articleAndRender)
//   }

//   return readable

}
