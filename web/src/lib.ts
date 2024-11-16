import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";
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
import { assert } from "console";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// export version

export const dataDir = process.env.DATA_DIR

if (dataDir === undefined)
  throw new Error("DATA_DIR env var not set")

if (!fs.existsSync(dataDir)) {
  throw new Error(`DATA_DIR ${dataDir} does not exist in filesystem`)
}

const dbFile = dataDir + "/db.json";

const savesDir = dataDir + "/saves";


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

async function extractImageUrls(doc: Document, articleUrl: string): Promise<ImageData[]> {
  const imgElements = doc.querySelectorAll("img");
  const imgData: ImageData[] = [];
  const baseDirectory = getBaseDirectory(articleUrl);

  imgElements.forEach((img) => {
    let imgUrl = img.src;

    // If the imgUrl is a relative URL or starts with '/', prepend the baseDirectory
    if (!imgUrl.match(/^[a-zA-Z]+:\/\//)) {
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
  articleUrl: string,
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
  await createThumbnail(imageData, saveDir);

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

async function createThumbnail(imageData: ImageData[], outputDirPath: string) {
  const maxDimensionThumb = 200;

  // Find the largest and squarest image as the thumbnail
  let chosenFile: string | null = null;
  let largestArea = 0;

  console.log("choosing thumbnail");

  for (const [url, fileName, img] of imageData) {
    // TODO: use img instead of reloading from disk

    const filePath = outputDirPath + "/images/" + fileName;

    console.log(filePath);

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
      // thumbnail = imageData;
    }
  }

  // TODO: can we use the favicon or something. useful for things like wikipedia

  // Create thumbnail
  if (chosenFile === null) return;

  // Get the path of the thumbnail image
  const thumbnailPath = outputDirPath + "/images/" + chosenFile;

  // Resize and save the image using sharp
  const outputFilePath = outputDirPath + "/images/" + "thumbnail.webp";

  try {
    await sharp(thumbnailPath)
      .resize(maxDimensionThumb, maxDimensionThumb, { fit: "cover", position: "center" })
      .toFormat("webp")
      .toFile(outputFilePath);
    console.log(`Thumbnail created: ${outputFilePath}`);
  } catch (error) {
    console.error(`Error creating thumbnail: ${error}`);
  }
}

export function pingLib() {
  return "pongLib";
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

/**
 * Converts bytes to a human-readable format.
 * @param bytes - The size in bytes.
 * @returns The size in a readable format.
 */
function humanReadableSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(2)} ${units[index]}`;
}

/**
 * Promisifies the `getDirectorySize` function for use with `async/await`.
 * @param dirPath - The path of the directory.
 * @returns A Promise resolving to the directory size.
 */
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

// Main function using async/await
async function main(): Promise<void> {
  const directoryPath = './your-directory-path-here'; // Replace with your directory path
  try {
    const sizeInBytes = await getDirectorySizeAsync(directoryPath);
    console.log(`Directory size: ${humanReadableSize(sizeInBytes)}`);
  } catch (err) {
    console.error('Error calculating directory size:', err);
  }
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

export async function articleList() {
  const db = await JSONFileSyncPreset<Articles>(dbFile, defaultData);
  return db.data.articles;
}

function toArticleAndRender(article: Article): ArticleAndRender {
  const newValues: ArticleRenderExtra = {
    infoForCard: generateInfoForCard(article)
  }

  return {
    article: article,
    extra: newValues
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
    fs.rmdirSync(savesDir + "/" + slug, { recursive: true })

  await createLocalHtmlList();

  console.log(`set state to ${state} for ${slug}`)
}

export async function ingest(
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
  const body = await response.text();

  console.log(url);

  // scrape the article

  // TODO: error out if 404 or if not readable

  sendMessage(10, "scraping article");

  var doc = new JSDOM(body, { url });

  let reader = new Readability(doc.window.document);
  let readabilityResult = reader.parse();

  if (readabilityResult === null) {
    throw new Error("Readability did not parse");
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

  // const rawFile = saveDir + "/raw.html";

  // fs.writeFileSync(rawFile, body);

  fs.writeFileSync(saveDir + "/readability.json", JSON.stringify(readabilityResult, null, 2));

  // fs.writeFileSync(saveDir + "/readability.html", readabilityResult.content);

  // const postlightResult = await Parser.parse(url, { html: body });
  // fs.writeFileSync(saveDir + "/postlight.json", JSON.stringify(postlightResult, null, 2));
  // fs.writeFileSync(saveDir + "/postlight.html", postlightResult.content);

  sendMessage(15, "collecting images");

  const content = await processHtmlAndImages(url, readabilityResult.content, saveDir, sendMessage);

  // fs.writeFileSync(saveDir + '/content.html', content)

  // create a page with the html

  var pubDate: Date | null = null;

  if (readabilityResult.publishedTime) pubDate = new Date(readabilityResult.publishedTime);

  // TODO: replace this with something consistent between kotlin and js
  const readingStats = readingTime(content);

  const domain = extractDomain(url);

  // const author = postlightResult.author || readabilityResult.byline;

  const author = readabilityResult.byline;

  const rendered = renderTemplate("article", {
    title: readabilityResult.title,
    byline: author,
    published: `<a href=${url}>${domain}</a> &#x2022; ${pubDate?.toDateString()}`,
    readTime: `${Math.round(readingStats.minutes)} minute read`,
    content: content,
    metadata: JSON.stringify({ ingestPlatform: version }, null, 2)
    // namespace: rootPath,
  });

  fs.writeFileSync(saveDir + "/index.html", rendered);

  const article: Article = {
    slug: slug,
    title: readabilityResult.title,
    url: url,
    state: "unread", // unread, reading, finished, archived, deleted, ingesting
    // subtitle: null,
    publication: null,
    author: author,
    publishedDate: pubDate?.toISOString(),
    ingestDate: new Date().toISOString(),
    ingestPlatform: `typescript/web (${version})`,
    ingestSource: "url",
    mimeType: "text/html",
    readTimeMinutes: Math.round(readingStats.minutes),
    progress: 0,
  };

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
