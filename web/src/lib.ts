import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import fs, { Dirent } from "fs";
import * as path from 'path';
import { dirname } from "path";
import { fileURLToPath } from "url";
// import Parser from "@postlight/parser";
import readingTime from "reading-time";
import axios from "axios";
import sharp from "sharp";
import url from "url";
import { JSONFileSyncPreset } from "lowdb/node";
import Mustache from "mustache";
import { ArticleAndRender, ArticleRenderExtra, Articles, Article } from "./models";
import { version } from '../package.json' with { type: "json" };
import { MIMEType } from "util";
import pdf2html, { thumbnail }  from "pdf2html";
import crypto from "crypto";
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import showdown from "showdown";



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const dataDir = process.env.DATA_DIR

if (dataDir === undefined)
  throw new Error("DATA_DIR env var not set")

if (!fs.existsSync(dataDir)) {
  throw new Error(`DATA_DIR ${dataDir} does not exist in filesystem`)
}

const dbFile = dataDir + "/db.json";

const savesDir = dataDir + "/saves";


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


const defaultData: Articles = { articles: [] };


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

function getBaseDirectory(articleUrl: string): string {
  const parsedUrl = new url.URL(articleUrl);
  return parsedUrl.pathname.endsWith("/") ? parsedUrl.href : url.resolve(parsedUrl.href, ".");
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
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  let imageCount = 0;
  let percent = 25;
  const endPercent = 93;

  const step = Math.round((endPercent - percent) / imageData.length / 2);

  for (const [url, modifiedPath] of imageData) {
    try {
      sendMessage(percent, `downloading image ${imageCount + 1} of ${imageData.length}`);

      // Download the image
      const response = await axios({
        url,
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(response.data, "binary");

      percent = percent + step;

      sendMessage(percent, `resizing image ${imageCount + 1} of ${imageData.length}`);

      // Resize the image if necessary
      const resizedImageBuffer = await sharp(imageBuffer)
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: sharp.fit.inside,
          withoutEnlargement: true,
        })
        .toBuffer();

      const outputFilePath = outputDir + "/" + modifiedPath;
      fs.writeFileSync(outputFilePath, resizedImageBuffer);
      console.log(`Downloaded and resized: ${outputFilePath}`);

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
  const dom = new JSDOM(htmlText);
  const doc = dom.window.document;
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
  return dom.serialize();
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
  const maxDimensionThumb = 200;

  // Find the largest and squarest image as the thumbnail
  let chosenFile: string | null = null;
  let largestArea = 0;

  console.log("choosing thumbnail");

  for (const fileName of fileNames) {
    // TODO: use img instead of reloading from disk

    // const filePath = outputDirPath + "/images/" + fileName;
    const filePath = fileName;

    console.log(`trying image ${filePath}`);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    // Use sharp to get image metadata
    const image = sharp(filePath);
    const metadata = await image.metadata();

    const area = (metadata.width || 0) * (metadata.height || 0);

    // Ignore small images
    if (area < 5000) {
      console.log(`Thumb ignore small: ${fileName}`);
      continue;
    }

    // Penalize excessively long/wide images
    const ratio =
      Math.max(metadata.width || 0, metadata.height || 0) /
      Math.min(metadata.width || 0, metadata.height || 0);
    if (ratio > 1.5) {
      console.log(`Thumb penalizing long/wide: ${fileName}`);
      continue;
    }

    // Penalize images with "sprite" in their name
    if (fileName.includes("sprite")) {
      console.log(`Thumb penalizing sprite: ${fileName}`);
      continue;
    }

    // Check if the current image has the largest area
    if (area > largestArea) {
      largestArea = area;
      chosenFile = fileName;
    }
  }

  // TODO: can we use the favicon or something. useful for things like wikipedia

  // Create thumbnail
  if (chosenFile === null) return;

  // Get the path of the thumbnail image
  // const thumbnailPath = outputDirPath + "/images/" + chosenFile;

  // Resize and save the image using sharp
  const outputFilePath = outputDirPath + "/" + "thumbnail.webp";

  try {
    await sharp(chosenFile)
      .resize(maxDimensionThumb, maxDimensionThumb, { fit: "cover", position: "center" })
      .toFormat("webp")
      .toFile(outputFilePath);
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


/**
 * Recursively calculates the size of a directory using a callback-based approach.
 * @param dirPath - The path of the directory.
 * @param callback - Callback to handle the result or error.
 */
function getDirectorySize(
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

function humanReadableSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(2)} ${units[index]}`;
}

function getDirectorySizeAsync(dirPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    getDirectorySize(dirPath, (err, size) => {
      if (err) {
        return reject(err);
      }
      resolve(size || 0);
    });
  });
}


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
  }

  return data
}

export async function renderSystemInfo() {

  const info = await systemInfo()

  const view = {
    content: JSON.stringify(info, null, 2)
  }

  return renderTemplate("about", view)
}

export function dirList() {
  const dirs = fs
    .readdirSync(savesDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  return dirs;
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

  return result
}


export function generateInfoForArticle(article: Article): string {

  var result = ""

  if (article.url != null) {
    const domain = extractDomain(article.url);

    if (domain != null) {
      result = `<a href=${url}>${domain}</a>`
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

export async function articleList() {
  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);
  return db.data.articles;
}

function toArticleAndRender(article: Article): ArticleAndRender {

  const mimeType = new MIMEType(article.mimeType)
  let ext = mimeToExt[article.mimeType]

  if (mimeType.type == "text") {
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

export function renderTemplate(templateName: string, view: object) {
  const mustacheTemplatePath = `${__dirname}/templates/${templateName}.mustache`;

  const mustacheTemplate = fs.readFileSync(mustacheTemplatePath, "utf-8");

  return Mustache.render(mustacheTemplate, view);
}

/**
 * Recursively copies all files and directories from the source directory to the destination directory.
 * @param srcDir - Path to the source directory.
 * @param destDir - Path to the destination directory.
 */
function copyDirectorySync(srcDir: string, destDir: string): void {
  // Ensure the destination directory exists, creating it if needed
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`All files have been copied from ${srcDir} to ${destDir}`);
}

function copyStaticFiles() {
  copyDirectorySync(__dirname + "/static/shared", dataDir + "/static")
}

export async function createLocalHtmlList() {

  const htmlOutfile = dataDir + "/list.html";

  const rootPath = "."

  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const [readable, archived] = articlesToRender(db.data.articles)
  
  const rendered = renderTemplate("list", {
    readable,
    archived,
    // rootPath: rootPath,
    namespace: rootPath,
    static: true,
    metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
  });

  fs.writeFileSync(htmlOutfile, rendered);

  copyStaticFiles()
}


export async function setState(slug: string, state: string) {

  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const existingArticleIndex = db.data.articles.findIndex((article) => article.slug === slug);

  // TODO: check valid states
  db.data.articles[existingArticleIndex].state = state

  await db.write();

  if (state == 'deleted') 
    try {
      fs.rmdirSync(savesDir + "/" + slug, { recursive: true })
    } catch (error) {
      console.log(error)
    }

  await createLocalHtmlList();

  console.log(`set state to ${state} for ${slug}`)
}

function readabilityToArticle(html: string, contentType: string, url: string|null): [Article, string] {

  var options = {}

  if (url !== null) {
    options = { url }
  } 

  var doc = new JSDOM(html, options);

  let reader = new Readability(doc.window.document);
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

  const saveDir = savesDir + "/" + slug;

  console.log(saveDir);

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  const content = readabilityResult.content

  // sendMessage(15, "collecting images");

  // create a page with the html

  var pubDate: Date | null = null;

  if (readabilityResult.publishedTime) pubDate = new Date(readabilityResult.publishedTime);

  // TODO: replace this with something consistent between kotlin and js
  const readingStats = readingTime(content);

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
    readTimeMinutes: Math.round(readingStats.minutes),
    progress: 0,
  };

  return [article, content]
}

function getReadableStream(response: Response): Readable {

  if (response.body === null) {
    throw new Error("null stream")
  }

  return readableStreamToNodeReadable(response.body)
}


function readableStreamToNodeReadable(stream: ReadableStream): Readable {

  const reader = stream.getReader();

  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null); // Signal end of stream
      } else {
        this.push(value);
      }
    }
  });
}


function articleFromImage(mimeType: MIMEType, checksum: string, url: string
) : Article {

  const title = `${mimeType.subtype} ${checksum}`

  const article: Article = {
    slug: stringToSlug(title),
    title: title,
    url: url,
    state: "unread", // unread, reading, finished, archived, deleted, ingesting
    publication: null,
    author: null,
    // publishedDate: pubDate?.toISOString(),
    publishedDate: null,
    ingestDate: new Date().toISOString(),
    ingestPlatform: `typescript/web (${version})`,
    ingestSource: "????",
    mimeType: mimeType.essence,
    readTimeMinutes: null,
    progress: 0,
  };

  return article
}


async function articleFromPdf(checksum: string, url: string): Promise<Article> {

  let article: Article

  // try {
  //   // TODO: I think pdf2html requires java/tika, so not great. next try pds2htmlEX
  //   const html = await pdf2html.html(tempLocalPath);

  //   let [art, content] = readabilityToArticle(html, url)
  //   article = art
  // } catch (error) {

    // console.log("error in pdf2html")

    const title = `pdf ${checksum}`
    const slug = stringToSlug(title)

    article = {
      slug: slug,
      title: title,
      url: url,
      state: "unread", // unread, reading, finished, archived, deleted, ingesting
      publication: null,
      author: null,
      // publishedDate: pubDate?.toISOString(),
      publishedDate: null,
      ingestDate: new Date().toISOString(),
      ingestPlatform: `typescript/web (${version})`,
      ingestSource: "url",
      mimeType: "application/pdf",
      // readTimeMinutes: Math.round(readingStats.minutes),
      readTimeMinutes: null,
      progress: 0,
    };

  // }

  // TODO: create thumbnail

  return article
}

async function ingestHtml(html: string, contentType: string, url: string|null,
  sendMessage: (percent: number | null, message: string | null) => void
) : Promise<Article> {

  sendMessage(10, "scraping article");

  let [article, content] = readabilityToArticle(html, contentType, url)

  const saveDir = savesDir + "/" + article.slug;

  sendMessage(15, "collecting images");

  content = await processHtmlAndImages(url, content, saveDir, sendMessage);

  const rendered = renderTemplate("article", {
    title: article.title,
    byline: article.author,
    published: generateInfoForArticle(article),
    readTime: `${article.readTimeMinutes} minute read`,
    content: content,
    metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
    // namespace: rootPath,
  });

  fs.writeFileSync(saveDir + "/index.html", rendered);

  return article
}


function ingestPlainText(text: string, url: string|null): Article {

  const title = `txt ${Date.now() + 0}`
  const slug = stringToSlug(title)

  const article: Article = {
    slug: slug,
    title: title,
    url: url,
    state: "unread",
    publication: null,
    author: null,
    publishedDate: null,
    ingestDate: new Date().toISOString(),
    ingestPlatform: `typescript/web (${version})`,
    ingestSource: "????",
    mimeType: "text/plain",
    readTimeMinutes: 1,  // TODO: set this correctly
    progress: 0,
  };

  const content = `<pre>${text}</pre>`

  // let [article, content] = readabilityToArticle(html, url)

  const saveDir = savesDir + "/" + article.slug;

  const rendered = renderTemplate("article", {
    title: article.title,
    byline: article.author,
    published: generateInfoForArticle(article),
    readTime: `${article.readTimeMinutes} minute read`,
    content: content,
    metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
    // namespace: rootPath,
  });

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  fs.writeFileSync(saveDir + "/index.html", rendered);

  return article
}


async function storeBinary(mimeType: MIMEType, stream: Readable) : Promise<[string, string]> {

  let id = Date.now() + 0
  const tempLocalPath = `/tmp/savr-${id}.${mimeToExt[mimeType.essence]}`

  const hash = crypto.createHash('md5');

  const fileStream = fs.createWriteStream(tempLocalPath);
  // await pipeline(stream, hash, fileStream) // TODO: get this to work in 1 pass
  // const checksum = hash.digest('hex')

  await pipeline(stream, fileStream)

  const checksum = crypto.randomUUID();  // TODO: actually calculate

  return [tempLocalPath, checksum]
}

function finalizeFileLocation(tempLocalPath: string, article: Article) {

  const saveDir = getSaveDirPath(article.slug)

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  const finalPath = `${saveDir}/${getFileName(article)}`

  fs.copyFileSync(tempLocalPath, finalPath)
  // TODO: move instead of copy
  // fs.renameSync(tempLocalPath, finalPath)

  // TODO: create thumbnail
}

function getFileName(article: Article) {
  return `index.${mimeToExt[article.mimeType]}`
}

function getSaveDirPath(slug: string) {
  return `${savesDir}/${slug}`;
}

function getFilePath(article: Article) {
  return `${getSaveDirPath(article.slug)}/${getFileName(article)}`
}

export async function ingestText(text: string, sendMessage: (percent: number | null, message: string | null) => void
) {
  sendMessage(0, "start");

  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const contentType = guessContentType(text)

  console.log(`guessed content type ${contentType}`)
  const mimeType = new MIMEType(contentType);

  let article

  sendMessage(10, "scraping article");

  if (mimeType.subtype == "html") {
  // NOTE: for now we assume input text is html
    article = await ingestHtml(text, contentType, null, sendMessage)

  } else if (mimeType.subtype == "markdown") {
    const converter = new showdown.Converter(),
    html = converter.makeHtml(text);

    article = await ingestHtml(html, contentType, null, sendMessage)
    article
    // article.mimeType = contentType

  } else {
    article = ingestPlainText(text, null)
  }

  article.mimeType = contentType

  const saveDir = savesDir + "/" + article.slug;
  fs.writeFileSync(saveDir + "/article.json", JSON.stringify(article, null, 2));

  // if (existingArticleIndex != -1) {
  //   db.data.articles[existingArticleIndex] = article;
  // } else {
    // keep the most recent at the top since its easier to read that way
    db.data.articles.unshift(article);
  // }

  await db.write();

  await createLocalHtmlList();

  sendMessage(100, "finished");
}


export async function ingestUrl(
  url: string,
  sendMessage: (percent: number | null, message: string | null) => void
) {
  sendMessage(0, "start");

  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);

  const existingArticleIndex = db.data.articles.findIndex((article) => article.url === url);

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
    const mimeType = new MIMEType(contentTypeHeader);

    if (!mimeToExt.hasOwnProperty(mimeType.essence)) {
      throw new Error(`Unsupported content type: ${contentTypeHeader}`);
    }

    if (mimeType.subtype === 'html') {

      article = await ingestHtml(await response.text(), contentTypeHeader, url, sendMessage)

    } else if (mimeType.subtype === 'pdf') {

      let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

      article = await articleFromPdf(checksum, url)

      finalizeFileLocation(tempLocalPath, article)

      // TODO: thumbnail

    } else if (mimeType.type === 'image') {

      let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

      article = articleFromImage(mimeType, checksum, url)

      finalizeFileLocation(tempLocalPath, article)

      createThumbnail([getFilePath(article)], getSaveDirPath(article.slug))

    } else {
      throw new Error(`No handler for content type ${contentTypeHeader}`)
    }

    article.ingestSource = "url"
    article.mimeType = mimeType.essence

  } catch(error) {
    console.error(error)
    throw new Error("error determining content type")
  }

  const saveDir = savesDir + "/" + article.slug;
  fs.writeFileSync(saveDir + "/article.json", JSON.stringify(article, null, 2));

  if (existingArticleIndex != -1) {
    db.data.articles[existingArticleIndex] = article;
  } else {
    // keep the most recent at the top since its easier to read that way
    db.data.articles.unshift(article);
  }

  await db.write();

  await createLocalHtmlList();

  sendMessage(100, "finished");
}
