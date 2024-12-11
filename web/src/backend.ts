// import FileManager from "@savr/lib";
import { ArticleAndRender, Articles, Article, FileManager, DbManager, upsertArticleToList, DB_FILE_NAME } from "@savr/lib";
// import { version } from '../package.json' with { type: "json" };
import fs, { Dirent } from "fs";
import path from "path";
// import * as path from 'path';
// import { get } from "http";


// import { FileManagerLocal } from "@savr/lib/node";


export class FileManagerNode extends FileManager {

  private directory: string;

  constructor(directory: string) {
    // super(directory);
    super();
    this.directory = directory;
  }

  // #directory: string; // a url or SAF path, or local dir
  
  public generateJsonDbManager(): DbManagerNode {
    return new DbManagerNode(this);
  }

  public async downloadAndResizeImage(url: string, targetDir: string) {

    const maxDimension = 200
    const filePath = url.split("/").pop()
    const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;

    // const response = await fetch(url);
    // const buffer = await response.buffer();

    // const type = await promisify(fileType.fromBuffer)(buffer);
    // const image = sharp(buffer);
    // const resizedImageBuffer = await image.resize(200, 200).toFormat(type.ext).toBuffer();
    // // const writeStream = createWriteStream(`resizedImage.${type.ext}`);

    // const writeStream = createWriteStream(outputFilePath);
    // await pipeline(resizedImageBuffer, writeStream);

  };


  public async writeTextFile(filename: string, content: string): Promise<void> {
    // import * as path from "path";

    // console.log("content: " + content);

    const fullPath = `${this.directory}/${filename}`;
    const dir = path.dirname(fullPath);

    console.log("writing file: " + fullPath);

    if (!fs.existsSync(dir)) {
      console.log("creating dir: " + dir);
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);

    // fs.writeFileSync(`${this.directory}/${filename}`, content);
  }

  public async readTextFile(filename: string): Promise<string> {
    return fs.readFileSync(`${this.directory}/${filename}`, 'utf8');
  }
}

export class DbManagerNode extends DbManager {

  public fileManager: FileManagerNode

  constructor(fm: FileManagerNode) {
    // super(fm);
    super();
    this.fileManager = fm
  }

  public async upsertArticle(article: Article) {

    const articles = await this.getArticles();

    upsertArticleToList(articles, article);

    this.fileManager.writeTextFile(DB_FILE_NAME, JSON.stringify({articles}, null, 2));

    // const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${article.slug}`, {
    //   method: 'PUT',
    //   body: JSON.stringify(article)
    // });
  }

  public async getArticle(slug: string): Promise<Article|undefined>  {
    
    // TODO: read from single article json file?

    const articles = await this.getArticles();

    return articles.find((article: Article) => article.slug === slug);
  }

  public async getArticles(): Promise<Article[]> {

    // const content = await this.fileManager.readTextFile(dbFile);

    const content = await this.fileManager.readTextFile(DB_FILE_NAME);

    const articles = JSON.parse(content).articles;

    // const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
    // // const articles: ArticleAndRender[] = await response.json();
    // const articles: Article[] = await response.json();

    return articles
    
  }

}




export async function systemInfo() {

  return {
    "system": "info"
  }

  // const articles = await getArticles();
  // // const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  // const sizeInBytes = await getDirectorySizeAsync(dataDir ?? "notfound");
  // console.log(`Directory size: ${humanReadableSize(sizeInBytes)}`);

  // const statusCounts: Record<string, number> = {};

  // for (const article of articles) {
  //   const { state } = article;
  //   statusCounts[state] = (statusCounts[state] || 0) + 1;
  // }

  // const data = {
  //   version,
  //   size: humanReadableSize(sizeInBytes),
  //   articles: statusCounts,
  // };

  // return data;
}

export async function renderSystemInfo() {

  const info = await systemInfo();

  const view = {
    content: JSON.stringify(info, null, 2)
  };

  // return renderTemplate("about", view);

  return "about template goes here";
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
        const fullPath = `${dirPath}/${entry.name}`;
  
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

// export function getArticles(): ArticleAndRender[] {
//   const db = JSONFileSyncPreset<Articles>(dbFile, defaultData);
//   return filterAndPrepareArticles(db.data.articles)
// }

// export function getArticles(): Article[] {
//   const db = JSONFileSyncPreset<Articles>(dbFile, defaultData);
//   return db.data.articles
// }


// export function getArticles(): Article[] {

//   // TODO: use defaultData if its blank or non existent

//   const data = fs.readFileSync(dbFile, "utf8");
//   const articles: Article[] = JSON.parse(data).articles;
//   return articles;
// }

// export function writeArticles(articles: Article[]) {
//   fs.writeFileSync(dbFile, JSON.stringify({articles}, null, 2));
// }


export async function generateFileManager() {

  const dataDir = process.env.DATA_DIR

  if (dataDir === undefined)
    throw new Error("DATA_DIR env var not set")

  const fm = new FileManagerNode(dataDir)

  return fm
}
