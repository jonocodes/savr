import { Readability } from "@mozilla/readability";
import {parseHTML} from 'linkedom';
import * as uri from "uri-js";
import { Article } from "./models";
import { version } from '../package.json' with { type: "json" };
// import { MIMEType } from "util";
import mime from 'mime';
// import pdf2html, { thumbnail }  from "pdf2html";
// import crypto from "crypto";
// import { pipeline } from 'stream/promises';
// import { Readable } from 'stream';
import showdown from "showdown";
import BaseClient from "remotestoragejs/release/types/baseclient";
import ArticleTemplate from "./article";
// import { listTemplateMoustache } from "./list";
import  { FileManager, articlesToRender, DbManager, generateInfoForArticle, renderListTemplate, toArticleAndRender, calcReadingTime } from "./lib";


// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// export const dataDir = process.env.DATA_DIR

// if (dataDir === undefined)
//   throw new Error("DATA_DIR env var not set")

// if (!fs.existsSync(dataDir)) {
//   throw new Error(`DATA_DIR ${dataDir} does not exist in filesystem`)
// }

// const savesDir = dataDir + "/saves";


// TODO: maybe dont need this mapping since the subtype is the extension
const mimeToExt: Record<string, string> = {
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


// export function upsertArticleToList(articles: Article[], article: Article){

//   const existingArticleIndex = articles.findIndex((a) => a.slug === article.slug);
//   if (existingArticleIndex !== -1) {
//     articles[existingArticleIndex] = article;
//   } else {
//     articles.unshift(article);
//   }
// }


function getBaseDirectory(articleUrl: string): string {
  const parsedUrl = uri.parse(articleUrl);
  const path = parsedUrl.path;
  if (!path) return "";
  return path.endsWith("/") ? articleUrl : uri.resolve(articleUrl, ".");
}

async function extractImageUrls(doc: Document, articleUrl: string|null): Promise<ImageData[]> {
  const imgElements = doc.querySelectorAll("img");
  const imgData: ImageData[] = [];

  let baseDirectory = null

  if (articleUrl !== null) {
    baseDirectory = getBaseDirectory(articleUrl);
  }

  imgElements.forEach((img) => {
    let imgUrl = img.src;

    // If the imgUrl is a relative URL or starts with '/', prepend the baseDirectory
    if (baseDirectory !== null && !imgUrl.match(/^[a-zA-Z]+:\/\//)) {
      imgUrl = new URL(imgUrl, baseDirectory).href;
    }

    // Remove the protocol part and replace slashes with double underscores
    let pathWithoutProtocol = imgUrl.replace(/^[a-zA-Z]+:\/\//, "");
    let modifiedPath = pathWithoutProtocol.replace(/\//g, "__");

    imgData.push([imgUrl, modifiedPath, img]);
  });

  return imgData;
}

async function downloadAndResizeImages(
  imageData: ImageData[],
  outputDir: string,
  maxDimension: number,
  sendMessage: (percent: number | null, message: string | null) => void
): Promise<void> {

  // if (!fs.existsSync(outputDir)) {
  //   fs.mkdirSync(outputDir);
  // }

  let imageCount = 0;
  let percent = 25;
  const endPercent = 93;

  const step = Math.round((endPercent - percent) / imageData.length / 2);

  for (const [url, modifiedPath] of imageData) {
    try {
      sendMessage(percent, `downloading image ${imageCount + 1} of ${imageData.length}`);

      // Download the image
      const response = await fetch(url);
      const imageBuffer = await response.arrayBuffer();

      percent = percent + step;

      sendMessage(percent, `resizing image ${imageCount + 1} of ${imageData.length}`);

      // Resize the image using Jimp
      // const image = await Jimp.read(imageBuffer);
      // const resizedImage = image.scaleToFit({h: maxDimension, w: maxDimension});
      
      const outputFilePath = outputDir + "/" + modifiedPath;

      // const ext = outputFilePath.split('.').pop();
      // // TODO: remove exp from outputFilePath

      // await resizedImage.write(`${outputFilePath}.${ext}`);
      // console.log(`Downloaded and resized: ${outputFilePath}`);

      // Store the file path for later use
      imageData.find(([imgUrl, imgPath]) => imgPath === modifiedPath)![2].dataset.localPath =
        outputFilePath;

      imageCount += 1;

      percent = percent + step;
    } catch (error) {
      console.error(`Error downloading or resizing image from ${url}:`, error);
    }
  }
}

function updateImageSrc(doc: Document, imageData: ImageData[], outputDir: string): void {
  imageData.forEach(([url, modifiedPath, imgElement]) => {
    // Use the local path set during downloading
    const localPath = (imgElement as any).dataset.localPath;
    if (localPath) {
      imgElement.src = `${outputDir}/${modifiedPath}`;
    }
  });
}

async function processHtmlAndImages(
  articleUrl: string|null,
  htmlText: string,
  saveDir: string,
  sendMessage: (percent: number | null, message: string | null) => void
):
Promise<string> {

  const { document:doc } = parseHTML(htmlText);

  const imageData = await extractImageUrls(doc, articleUrl);
  const outputDir = saveDir + "/images";
  const maxDimension = 1024;

  console.log(imageData);

  sendMessage(20, "downloading images");

  await downloadAndResizeImages(imageData, outputDir, maxDimension, sendMessage);

  // Update the src attribute of the img elements in the document
  updateImageSrc(doc, imageData, "images");

  // yield { percent: 50, message: "creating thumbnail" };
  sendMessage(95, "creating thumbnail");
  // create the thumbnail

  const imageFileNames = imageData.map(item => outputDir + "/" + item[1]);

  await createThumbnail(imageFileNames, saveDir);

  // Serialize the updated DOM to get the updated HTML string
  // return dom.serialize();
  return doc.documentElement.outerHTML
}

function stringToSlug(str: string): string {
  str = str.replace(/^\s+|\s+$/g, ""); // trim
  str = str.toLowerCase();

  // TODO: truncate at max length

  // remove accents, swap ñ for n, etc
  var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
  var to = "aaaaeeeeiiiioooouuuunc------";
  for (var i = 0, l = from.length; i < l; i++) {
    str = str.replace(new RegExp(from.charAt(i), "g"), to.charAt(i));
  }

  str = str
    .replace(/[^a-z0-9 -]/g, "") // remove invalid chars
    .replace(/\s+/g, "-") // collapse whitespace and replace by -
    .replace(/-+/g, "-"); // collapse dashes

  return str;
}

async function createThumbnail(fileNames: string[], outputDirPath: string) {
  let chosenFile: string | null = null;
  let maxArea = 0;
  const maxDimensionThumb = 512;

  for (const fileName of fileNames) {
    const filePath = fileName;

    // if (!fs.existsSync(filePath)) {
    //   continue;
    // }

    // Use Jimp to get image metadata
    // const image = await Jimp.read(filePath);
    // const metadata = image.bitmap;

    // const area = metadata.width * metadata.height;

    const area = 1024 * 1024

    // Ignore small images
    if (area < 5000) {
      continue;
    }

    // Prefer images with more pixels (likely higher quality)
    if (area > maxArea) {
      maxArea = area;
      chosenFile = filePath;
    }
  }

  if (chosenFile === null) return;

  const outputFilePath = outputDirPath + "/" + "thumbnail";

  try {
    // const image = await Jimp.read(chosenFile);
    // // await image
    // //   .cover(maxDimensionThumb, maxDimensionThumb)
    // //   .quality(80)
    // //   .writeAsync(outputFilePath);

    // await image
    //   .scaleToFit({w: maxDimensionThumb, h: maxDimensionThumb}) // Resize using ScaleToFitOptions
    //   .write(`${outputFilePath}.${'png'}`); // Save as PNG
      
    console.log(`Thumbnail created: ${outputFilePath}`);
  } catch (error) {
    console.error(`Error creating thumbnail: ${error}`);
  }
}

function guessContentType(input: string): string {
  // Trim input to remove leading/trailing whitespace
  const trimmedInput = input.trim();

  // Simplified HTML check: match any tag or <!DOCTYPE html>
  const htmlTagRegex = /^(<!DOCTYPE html>|<\s*[a-zA-Z][^>]*>.*<\/\s*[a-zA-Z][^>]*>)$/s;
  if (htmlTagRegex.test(trimmedInput)) {
    return 'text/html';
  }

  // Markdown check: only look for headings
  const markdownHeadingRegex = /^#{1,6}\s+/m; // Match lines starting with 1-6 # symbols
  if (markdownHeadingRegex.test(trimmedInput)) {
    return 'text/markdown';
  }
  

  // TODO: this does not work well. try htmlparser2 and markdown-it/showdown parsing test


  // // Check for HTML
  // if (/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/.test(trimmedInput)) {
  //   return 'text/html';
  // }

  // // Check for Markdown
  // if (
  //   /^(#{1,6}\s|[*_~]{1,3}.*[*_~]{1,3}|!\[.*\]\(.*\)|\[.*\]\(.*\))/.test(
  //     trimmedInput
  //   )
  // ) {
  //   return 'text/markdown';
  // }

  // Default to plain text
  return 'text/plain';
}


// export function dirList() {
//   const dirs = fs
//     .readdirSync(savesDir, { withFileTypes: true })
//     .filter((item) => item.isDirectory())
//     .map((item) => item.name);

//   return dirs;
// }


// export async function articleList() {
//   const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);
//   return db.data.articles;
// }

// export async function getArticles(dbManager: DbManager): Promise<Article[]> {

//   return await dbManager.getArticles()
  
// }



// export function articlesToRender(articles: Article[]): [ArticleAndRender[], ArticleAndRender[]] {

//   const readable: ArticleAndRender[] = []
//   const archived: ArticleAndRender[] = []

//   for (const article of articles) {

//     const articleAndRender = toArticleAndRender(article)

//     if (article.state === "archived")
//       archived.push(articleAndRender)
//     else if (article.state != "deleted")
//       readable.push(articleAndRender)
//   }

//   return [readable, archived]

// }


// export function renderListTemplate(view: object) {
//   return Mustache.render(listTemplateMoustache, view);
// }





// /**
//  * Recursively copies all files and directories from the source directory to the destination directory.
//  * @param srcDir - Path to the source directory.
//  * @param destDir - Path to the destination directory.
//  */
// function copyDirectorySync(srcDir: string, destDir: string): void {
//   // Ensure the destination directory exists, creating it if needed
//   if (!fs.existsSync(destDir)) {
//     fs.mkdirSync(destDir, { recursive: true });
//   }

//   const entries = fs.readdirSync(srcDir, { withFileTypes: true });

//   for (const entry of entries) {
//     const srcPath = `${srcDir}/${entry.name}`; // path.join(srcDir, entry.name);
//     const destPath =`${destDir}/${entry.name}`;

//     if (entry.isDirectory()) {
//       copyDirectorySync(srcPath, destPath);
//     } else {
//       fs.copyFileSync(srcPath, destPath);
//     }
//   }

//   console.log(`All files have been copied from ${srcDir} to ${destDir}`);
// }

// function copyStaticFiles() {
//   copyDirectorySync(__dirname + "/static/shared", dataDir + "/static")
// }

export async function createLocalHtmlList(dbManager: DbManager) {

  // const htmlOutfile = await dbManager.fileManager.readTextFile('list.html')

  // const htmlOutfile = dataDir + "/list.html";

  const rootPath = "."

  const articles = await dbManager.getArticles()

  // const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const [readable, archived] = articlesToRender(articles)

  const rendered = renderListTemplate({
    readable,
    archived,
    // rootPath: rootPath,
    namespace: rootPath,
    static: true,
    metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
  });

  dbManager.fileManager.writeTextFile('list.html', rendered)

  // fs.writeFileSync(htmlOutfile, rendered);

  // copyStaticFiles()
}


export async function setState(dbManager: DbManager, slug: string, state: string) {

  // const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const article = await dbManager.getArticle(slug)

  if (!article) {
    throw new Error("article not found")
  }

  article.state = state

  await dbManager.upsertArticle(article)


  // const existingArticleIndex = db.data.articles.findIndex((article: Article) => article.slug === slug);

  // // TODO: check valid states
  // db.data.articles[existingArticleIndex].state = state

  // await db.write();

  if (state == 'deleted') 
    try {
  // TODO: delete the directory
      // fs.rmdirSync(savesDir + "/" + slug, { recursive: true })
    } catch (error) {
      console.log(error)
    }

  await createLocalHtmlList(dbManager);

  console.log(`set state to ${state} for ${slug}`)
}

export function readabilityToArticle(html: string, contentType: string, url: string|null): [Article, string] {

  var options = {}

  if (url !== null) {
    options = { url, contentType }
  }

  console.log('running readability')

  const { document } = parseHTML(html);

  let reader = new Readability(document);
  let readabilityResult = reader.parse();

  if (readabilityResult === null) {
    throw new Error("Readability did not parse");
  }

  if (readabilityResult.title == "") {
    readabilityResult.title = `${mimeToExt[contentType]} ${Date.now() + 0}`
  }

  console.log(`title: ${readabilityResult.title}`);
  console.log(`length: ${readabilityResult.length}`);

  // TODO: handle case where title is not found?

  const slug = stringToSlug(readabilityResult.title);

  // const saveDir = savesDir + "/" + slug;

  // console.log(saveDir);

  // if (!fs.existsSync(saveDir)) {
  //   fs.mkdirSync(saveDir, { recursive: true });
  // }

  const content = readabilityResult.content

  // sendMessage(15, "collecting images");

  // create a page with the html

  var pubDate: Date | null = null;

  if (readabilityResult.publishedTime) pubDate = new Date(readabilityResult.publishedTime);

  const readingTimeMinutes = calcReadingTime(content);

  const author = readabilityResult.byline;

  const article: Article = {
    slug: slug,
    title: readabilityResult.title,
    url: url,
    state: "unread", // unread, reading, finished, archived, deleted, ingesting
    publication: null,
    author: author,
    publishedDate: pubDate?.toISOString(),
    ingestDate: new Date().toISOString(),
    ingestPlatform: `typescript/web (${version})`,
    ingestSource: "????",
    mimeType: contentType,
    readTimeMinutes: readingTimeMinutes,
    progress: 0,
  };

  return [article, content]
}

// function getReadableStream(response: Response): Readable {

//   if (response.body === null) {
//     throw new Error("null stream")
//   }

//   return readableStreamToNodeReadable(response.body)
// }


// function readableStreamToNodeReadable(stream: ReadableStream): Readable {

//   const reader = stream.getReader();

//   return new Readable({
//     async read() {
//       const { done, value } = await reader.read();
//       if (done) {
//         this.push(null); // Signal end of stream
//       } else {
//         this.push(value);
//       }
//     }
//   });
// }


// function articleFromImage(mimeType: MIMEType, checksum: string, url: string
// ) : Article {

//   const title = `${mimeType.subtype} ${checksum}`

//   const article: Article = {
//     slug: stringToSlug(title),
//     title: title,
//     url: url,
//     state: "unread",
//     publication: null,
//     author: null,
//     // publishedDate: pubDate?.toISOString(),
//     publishedDate: null,
//     ingestDate: new Date().toISOString(),
//     ingestPlatform: `typescript/web (${version})`,
//     ingestSource: "????",
//     mimeType: mimeType.essence,
//     readTimeMinutes: null,
//     progress: 0,
//   };

//   return article
// }


// async function articleFromPdf(checksum: string, url: string): Promise<Article> {

//   let article: Article

//   // try {
//   //   // TODO: I think pdf2html requires java/tika, so not great. next try pds2htmlEX
//   //   const html = await pdf2html.html(tempLocalPath);

//   //   let [art, content] = readabilityToArticle(html, url)
//   //   article = art
//   // } catch (error) {

//     // console.log("error in pdf2html")

//     const title = `pdf ${checksum}`
//     const slug = stringToSlug(title)

//     article = {
//       slug: slug,
//       title: title,
//       url: url,
//       state: "unread", // unread, reading, finished, archived, deleted, ingesting
//       publication: null,
//       author: null,
//       // publishedDate: pubDate?.toISOString(),
//       publishedDate: null,
//       ingestDate: new Date().toISOString(),
//       ingestPlatform: `typescript/web (${version})`,
//       ingestSource: "url",
//       mimeType: "application/pdf",
//       // readTimeMinutes: Math.round(readingStats.minutes),
//       readTimeMinutes: null,
//       progress: 0,
//     };

//   // }

//   // TODO: create thumbnail

//   return article
// }

async function ingestHtml(fileManager: FileManager, html: string, contentType: string, url: string|null,
  sendMessage: (percent: number | null, message: string | null) => void
) : Promise<Article> {

  sendMessage(10, "scraping article");

  let [article, content] = readabilityToArticle(html, contentType, url)

  const saveDir =  "saves/" + article.slug;

  sendMessage(15, "collecting images");

  content = await processHtmlAndImages(url, content, saveDir, sendMessage);

  const rendered = ArticleTemplate({
    title: article.title,
    byline: article.author || 'unknown author',
    published: generateInfoForArticle(article),
    readTime: `${article.readTimeMinutes} minute read`,
    content: content,
    // metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
    // namespace: rootPath,

  })  

  // const rendered = renderTemplate("article", {
  //   title: article.title,
  //   byline: article.author,
  //   published: generateInfoForArticle(article),
  //   readTime: `${article.readTimeMinutes} minute read`,
  //   content: content,
  //   metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
  //   // namespace: rootPath,
  // });

  // fs.writeFileSync(saveDir + "/index.html", rendered);
  fileManager.writeTextFile(saveDir + "/index.html", rendered)

  return article
}



export async function ingestHtml2(storageClient: BaseClient|null, html: string, contentType: string, url: string|null,
  sendMessage: (percent: number | null, message: string | null) => void
) : Promise<Article> {

  sendMessage(10, "scraping article");

  let [article, content] = readabilityToArticle(html, contentType, url)

  const saveDir =  "saves/" + article.slug;

  // storageClient?.storeFile("text/html", `${saveDir}/index.html`, content);

  sendMessage(15, "collecting images");

  // content = await processHtmlAndImages(url, content, saveDir, sendMessage);

  const rendered = ArticleTemplate({
    title: article.title,
    byline: article.author || 'unknown author',
    published: generateInfoForArticle(article),
    readTime: `${article.readTimeMinutes} minute read`,
    content: content,
    // metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
    // namespace: rootPath,

  })  

  // fileManager.writeTextFile(saveDir + "/index.html", rendered)

  storageClient?.storeFile("text/html", `${saveDir}/index.html`, rendered);

  // console.log(article);

  return article
}



// function ingestPlainText(text: string, url: string|null): Article {

//   const title = `txt ${Date.now() + 0}`
//   const slug = stringToSlug(title)

//   const article: Article = {
//     slug: slug,
//     title: title,
//     url: url,
//     state: "unread",
//     publication: null,
//     author: null,
//     publishedDate: null,
//     ingestDate: new Date().toISOString(),
//     ingestPlatform: `typescript/web (${version})`,
//     ingestSource: "????",
//     mimeType: "text/plain",
//     readTimeMinutes: 1,  // TODO: set this correctly
//     progress: 0,
//   };

//   const content = `<pre>${text}</pre>`

//   // let [article, content] = readabilityToArticle(html, url)

//   const saveDir = "saves/" + article.slug;

//   const rendered = ArticleTemplate({
//     title: article.title,
//     byline: article.author || 'unknown author',
//     published: generateInfoForArticle(article),
//     readTime: `${article.readTimeMinutes} minute read`,
//     content: content,
//     // metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
//     // namespace: rootPath,

//   })  

//   // const rendered = renderTemplate("article", {
//   //   title: article.title,
//   //   byline: article.author,
//   //   published: generateInfoForArticle(article),
//   //   readTime: `${article.readTimeMinutes} minute read`,
//   //   content: content,
//   //   metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
//   //   // namespace: rootPath,
//   // });

//   if (!fs.existsSync(saveDir)) {
//     fs.mkdirSync(saveDir, { recursive: true });
//   }

//   fs.writeFileSync(saveDir + "/index.html", rendered);

//   return article
// }

function generateRandomString() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomString = '';
  for (let i = 0; i < 16; i++) {
    randomString += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return randomString;
}

console.log(generateRandomString());

// async function storeBinary(mimeType: MIMEType, stream: Readable) : Promise<[string, string]> {

//   let id = Date.now() + 0
//   const tempLocalPath = `/tmp/savr-${id}.${mimeToExt[mimeType.essence]}`

//   // const hash = crypto.createHash('md5');

//   const fileStream = fs.createWriteStream(tempLocalPath);
//   // await pipeline(stream, hash, fileStream) // TODO: get this to work in 1 pass
//   // const checksum = hash.digest('hex')

//   await pipeline(stream, fileStream)

//   const checksum = generateRandomString();  // TODO: actually calculate

//   // const checksum = crypto.randomUUID();  // TODO: actually calculate

//   return [tempLocalPath, checksum]
// }

// function finalizeFileLocation(tempLocalPath: string, article: Article) {

//   const saveDir = getSaveDirPath(article.slug)

//   if (!fs.existsSync(saveDir)) {
//     fs.mkdirSync(saveDir, { recursive: true });
//   }

//   const finalPath = `${saveDir}/${getFileName(article)}`

//   fs.copyFileSync(tempLocalPath, finalPath)
//   // TODO: move instead of copy
//   // fs.renameSync(tempLocalPath, finalPath)

//   // TODO: create thumbnail
// }

// function getFileName(article: Article) {
//   return `index.${mimeToExt[article.mimeType]}`
// }

// function getSaveDirPath(slug: string) {
//   return `${savesDir}/${slug}`;
// }

// function getFilePath(article: Article) {
//   return `${getSaveDirPath(article.slug)}/${getFileName(article)}`
// }

// export async function ingestText(dbManager: DbManager, text: string, sendMessage: (percent: number | null, message: string | null) => void
// ) {
//   sendMessage(0, "start");

//   // const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

//   const contentType = guessContentType(text)

//   console.log(`guessed content type ${contentType}`)
//   const mimeType = new MIMEType(contentType);

//   let article

//   sendMessage(10, "scraping article");

//   if (mimeType.subtype == "html") {
//   // NOTE: for now we assume input text is html
//     article = await ingestHtml(dbManager.fileManager, text, contentType, null, sendMessage)

//   } else if (mimeType.subtype == "markdown") {
//     const converter = new showdown.Converter(),
//     html = converter.makeHtml(text);

//     article = await ingestHtml(dbManager.fileManager, html, contentType, null, sendMessage)
//     article
//     // article.mimeType = contentType

//   } else {
//     article = ingestPlainText(text, null)
//   }

//   article.mimeType = contentType

//   const saveDir = "saves/" + article.slug;
//   fs.writeFileSync(saveDir + "/article.json", JSON.stringify(article, null, 2));

//   // keep the most recent at the top since its easier to read that way
//   // db.data.articles.unshift(article);
//   await dbManager.upsertArticle(article);

//   // await db.write();

//   await createLocalHtmlList(dbManager);

//   sendMessage(100, "finished");
// }


export async function ingestUrl(
  dbManager: DbManager,
  url: string,
  sendMessage: (percent: number | null, message: string | null) => void
) {
  sendMessage(0, "start");

  // const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const articles = await dbManager.getArticles();

  const existingArticleIndex = articles.findIndex((article: Article) => article.url === url);

  // const existingArticleIndex = db.data.articles.findIndex((article: Article) => article.url === url);

  if (existingArticleIndex != -1) {
    sendMessage(5, "article already exists - reingesting");
  }

  const response = await fetch(url);

  const contentTypeHeader = response.headers.get("content-type")

  if (!contentTypeHeader) {
    throw new Error("cant determine content type")
  }

  // sendMessage(10, "scraping article");

  var article: Article | null = null

  console.log(`contentTypeHeader = ${contentTypeHeader}`)

  try {

    const extension = mime.getExtension(contentTypeHeader)
    const mimeType = mime.getType(extension??"");

    // const mimeType = new MIMEType(contentTypeHeader);

    if (!mimeType || !mimeToExt.hasOwnProperty(mimeType)) {
      throw new Error(`Unsupported content type: ${contentTypeHeader}`);
    }

    if (mimeType === 'text/html') {

      article = await ingestHtml(dbManager.fileManager, await response.text(), contentTypeHeader, url, sendMessage)

    // } else if (mimeType.subtype === 'pdf') {

    //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

    //   article = await articleFromPdf(checksum, url)

    //   finalizeFileLocation(tempLocalPath, article)

    //   // TODO: thumbnail

    // } else if (mimeType.type === 'image') {

    //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

    //   article = articleFromImage(mimeType, checksum, url)

    //   finalizeFileLocation(tempLocalPath, article)

    //   createThumbnail([getFilePath(article)], getSaveDirPath(article.slug))

    } else {
      throw new Error(`No handler for content type ${contentTypeHeader}`)
    }

    article.ingestSource = "url"
    article.mimeType = mimeType

  } catch(error) {
    console.error(error)
    throw new Error("error during ingestion")
  }

  const saveDir = "saves/" + article.slug;

  dbManager.fileManager.writeTextFile(saveDir + "/article.json", JSON.stringify(article, null, 2))
  // fs.writeFileSync(saveDir + "/article.json", JSON.stringify(article, null, 2));

  dbManager.upsertArticle(article);

  // if (existingArticleIndex != -1) {
  //   db.data.articles[existingArticleIndex] = article;
  // } else {
  //   // keep the most recent at the top since its easier to read that way
  //   db.data.articles.unshift(article);
  // }

  // await db.write();

  await createLocalHtmlList(dbManager);

  sendMessage(100, "finished");
}


export async function ingestUrl2(
  storageClient: BaseClient|null,
  corsProxy: string|null,
  url: string,
  sendMessage: (percent: number | null, message: string | null) => void
) {
  sendMessage(0, "start");

  // TODO: add back these lines
  // const articles = await dbManager.getArticles();

  const response = await fetch(`${corsProxy}${url}`);

  const contentTypeHeader = response.headers.get("content-type")

  if (!contentTypeHeader) {
    throw new Error("cant determine content type")
  }

  // sendMessage(10, "scraping article");

  var article: Article | null = null

  console.log(`contentTypeHeader = ${contentTypeHeader}`)

  try {

    const extension = mime.getExtension(contentTypeHeader)
    const mimeType = mime.getType(extension??"");

    // const mimeType = new MIMEType(contentTypeHeader);

    if (!mimeType || !mimeToExt.hasOwnProperty(mimeType)) {
      throw new Error(`Unsupported content type: ${contentTypeHeader}`);
    }

    if (mimeType === 'text/html') {

      article = await ingestHtml2(storageClient, await response.text(), contentTypeHeader, url, sendMessage)

    // } else if (mimeType.subtype === 'pdf') {

    //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

    //   article = await articleFromPdf(checksum, url)

    //   finalizeFileLocation(tempLocalPath, article)

    //   // TODO: thumbnail

    // } else if (mimeType.type === 'image') {

    //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

    //   article = articleFromImage(mimeType, checksum, url)

    //   finalizeFileLocation(tempLocalPath, article)

    //   createThumbnail([getFilePath(article)], getSaveDirPath(article.slug))

    } else {
      throw new Error(`No handler for content type ${contentTypeHeader}`)
    }

    article.ingestSource = "url"
    article.mimeType = mimeType

  } catch(error) {
    console.error(error)
    throw new Error("error during ingestion")
  }

  const saveDir = "saves/" + article.slug;

  storageClient?.storeFile("application/json", saveDir + "/article.json", JSON.stringify(article, null, 2))

  // TODO: dbManager.upsertArticle(article); 

  // if (existingArticleIndex != -1) {
  //   db.data.articles[existingArticleIndex] = article;
  // } else {
  //   // keep the most recent at the top since its easier to read that way
  //   db.data.articles.unshift(article);
  // }

  // await db.write();

  // TODO: await createLocalHtmlList(dbManager);

  sendMessage(100, "finished");

  return article
}
