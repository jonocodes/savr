// import { Jimp } from "jimp";
import Mustache from "mustache";
import { ArticleAndRender, ArticleRenderExtra, Articles, Article } from "./models";
import { version } from '../package.json' with { type: "json" };

// import pdf2html, { thumbnail }  from "pdf2html";
import { listTemplateMoustache } from "./list";


// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// export const dataDir = process.env.DATA_DIR

// if (dataDir === undefined)
//   throw new Error("DATA_DIR env var not set")

// if (!fs.existsSync(dataDir)) {
//   throw new Error(`DATA_DIR ${dataDir} does not exist in filesystem`)
// }

export const DB_FILE_NAME='db.json'

// export const dbFile = `${dataDir}/${DB_FILE_NAME}`;

// const savesDir = dataDir + "/saves";


// TODO: maybe dont need this mapping since the subtype is the extension
export const mimeToExt: Record<string, string> = {
  'text/html': 'html',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  // application/epub+zip
};

type ImageData = [string, string, HTMLImageElement]; // url, path, image


// export const defaultData: Articles = { articles: [] };


function extractDomain(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    let domain = parsedUrl.hostname;

    if (domain.startsWith("www.")) {
      domain = domain.substring(4);
    }

    return domain;
  } catch (error) {
    console.error("Invalid URL:", error);
    return null;
  }
}

export function calcReadingTime(text: string): number {

  const wordCount = text.split(/\s+/).length;

  const wordsPerMinute = 200; // adjust this value if needed

  const readingTimeMinutes = wordCount / wordsPerMinute;

  const roundedReadingTime = Math.ceil(readingTimeMinutes);

  // console.log(`Estimated reading time: ${roundedReadingTime} minute(s)`);
  return roundedReadingTime;
}

export function humanReadableSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(2)} ${units[index]}`;
}


export function generateInfoForCard(article: Article): string {

  var result = ""

  if (article.author != null && article.author != "") {
    result = article.author
  }

  if (article.publishedDate != null && article.publishedDate != undefined) {

    const pubDate = new Date(article.publishedDate)
    
    if (result == "") {
      result = pubDate.toDateString()
    } else {
      result = result + ", " + pubDate.toDateString()
    }

  }

  if (article.readTimeMinutes != null && article.readTimeMinutes != 0) {

    const read = `${article.readTimeMinutes} minute read`

    if (result == "") {
        result = read
    } else {
        result = `${result} • ${read}`
    }

  }

  return result
}

export function upsertArticleToList(articles: Article[], article: Article){

  const existingArticleIndex = articles.findIndex((a) => a.slug === article.slug);
  if (existingArticleIndex !== -1) {
    articles[existingArticleIndex] = article;
  } else {
    articles.unshift(article);
  }
}

export function getArticleBySlug(articles: Article[], slug: string): Article | undefined {
  return articles.find((article: Article) => article.slug === slug);
}


export function generateInfoForArticle(article: Article): string {

  var result = ""

  if (article.url != null) {
    const domain = extractDomain(article.url);

    if (domain != null) {
      result = `<a href=${article.url}>${domain}</a>`
    }
  }

  if (article.publishedDate != null && article.publishedDate != undefined) {

    const pubDate = new Date(article.publishedDate)
    
    if (result == "") {
      result = pubDate.toDateString()
    } else {
      result = result + " &#x2022; " + pubDate.toDateString()
    }

  }

  return result
}

// export async function articleList() {
//   const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);
//   return db.data.articles;
// }

// export async function getArticles(dbManager: DbManager): Promise<Article[]> {

//   return await dbManager.getArticles()
  
// }

export function filterAndPrepareArticles(articles: Article[]): ArticleAndRender[] {

  const readable: ArticleAndRender[] = []

  for (const article of articles) {

    const articleAndRender = toArticleAndRender(article)

    if (article.state != "deleted")
      readable.push(articleAndRender)
  }

  return readable

}

export function toArticleAndRender(article: Article): ArticleAndRender {

  // const mimeType = new MIMEType(article.mimeType)
  let ext = mimeToExt[article.mimeType]

  // if (mimeType.type == "text") {
  if (article.mimeType.startsWith("text/")) {
    ext = "html"
  }

  const newValues: ArticleRenderExtra = {
    infoForCard: generateInfoForCard(article),
    fileName: `index.${ext}`
  }

  return {
    article: article,
    extra: newValues,
  }
}


export function articlesToRender(articles: Article[]): [ArticleAndRender[], ArticleAndRender[]] {

  const readable: ArticleAndRender[] = []
  const archived: ArticleAndRender[] = []

  for (const article of articles) {

    const articleAndRender = toArticleAndRender(article)

    if (article.state === "archived")
      archived.push(articleAndRender)
    else if (article.state != "deleted")
      readable.push(articleAndRender)
  }

  return [readable, archived]

}

// export function renderTemplate(templateName: string, view: object) {
//   const mustacheTemplatePath = `${__dirname}/templates/${templateName}.mustache`;

//   const mustacheTemplate = fs.readFileSync(mustacheTemplatePath, "utf-8");

//   return Mustache.render(mustacheTemplate, view);
// }



export function renderListTemplate(view: object) {
  return Mustache.render(listTemplateMoustache, view);
}


// function getFileName(article: Article) {
//   return `index.${mimeToExt[article.mimeType]}`
// }

// function getSaveDirPath(slug: string) {
//   return `${savesDir}/${slug}`;
// }

// function getFilePath(article: Article) {
//   return `${getSaveDirPath(article.slug)}/${getFileName(article)}`
// }


export class DbManager {

  public fileManager: FileManager

  constructor(fm: FileManager) {
    this.fileManager = fm
  }

  public async setArticleState(slug: string, state: string) : Promise<Article> {

    const articles = await this.getArticles();

    const existingArticleIndex = articles.findIndex((a) => a.slug === slug);
    // if (existingArticleIndex !== -1) {
      articles[existingArticleIndex].state = state

      this.fileManager.writeTextFile(DB_FILE_NAME, JSON.stringify({articles}, null, 2));

      return articles[existingArticleIndex]
    // } else {
    //   console.error("article not found")
    // }

  }

  public async upsertArticle(article: Article) {

    const articles = await this.getArticles();

    const contentPre = await this.fileManager.readTextFile(DB_FILE_NAME);
    
    console.log("db before insert:", contentPre)

    upsertArticleToList(articles, article);

    this.fileManager.writeTextFile(DB_FILE_NAME, JSON.stringify({articles}, null, 2));

    const content = await this.fileManager.readTextFile(DB_FILE_NAME);
    
    console.log("db after insert:", content)
  }

  public async getArticle(slug: string): Promise<Article|undefined> {
    
    // TODO: read from single article json file?

    const articles = await this.getArticles();

    return articles.find((article: Article) => article.slug === slug);
  }

  public async getArticles(): Promise<Article[]> {

    const content = await this.fileManager.readTextFile(DB_FILE_NAME);

    const articles = JSON.parse(content).articles;

    // const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
    // // const articles: ArticleAndRender[] = await response.json();
    // const articles: Article[] = await response.json();

    return articles
    
  }

}

// interface IFileManager {
//   directory: string;
//   readTextFile(filename: string): Promise<string>;
//   readTextFile(filename: string): Promise<string>;
//   generateJsonDbManager(): DbManager;
//   downloadAndResizeImage(url: string, targetDir: string): Promise<void>;
// }

// export class FileManager {

//   // public directory: string; // TODO rename basepath?
//   // protected directory: string;

//   // // #directory: string; // a url or SAF path, or local dir

//   // constructor(directory: string) {
//   //   this.directory = directory;
//   // }

//   // public getDirectory(): string {
//   //   return this.directory;
//   // }

//   public writeTextFile(filename: string, content: string): Promise<void> {
//     throw new Error("Method not implemented."); 
//   };

//   public readTextFile(filename: string): Promise<string> {
//     throw new Error("Method not implemented."); 
//   };;
//   public generateJsonDbManager(): DbManager {
//     throw new Error("Method not implemented."); 
//   };;

//   public downloadAndResizeImage(url: string, targetDir: string): Promise<void> {
//     throw new Error("Method not implemented."); 
//   };;
// }

export abstract class FileManager {

  // // public directory: string; // TODO rename basepath?
  public abstract directory: string;

  // // #directory: string; // a url or SAF path, or local dir

  // constructor(directory: string) {
  //   this.directory = directory;
  // }

  // public getDirectory(): string {
  //   return this.directory;
  // }

  abstract writeTextFile(filename: string, content: string): Promise<void>;

  public abstract readTextFile(filename: string): Promise<string>;

  public abstract generateJsonDbManager(): DbManager;

  public abstract downloadAndResizeImage(url: string, targetDir: string): Promise<void>;

  public abstract deleteDir(dir: string): Promise<void>;
}

