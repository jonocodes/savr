import { Readability } from "@mozilla/readability";
import * as uri from "uri-js";
import { Article } from "./models";
import { version } from "../../package.json" with { type: "json" };
import mime from "mime";
import BaseClient from "remotestoragejs/release/types/baseclient";
import ArticleTemplate, { createArticleObject } from "./article";
import {
  generateInfoForArticle,
  calcReadingTime,
  getFilePathRaw,
  getFilePathContent,
  getFilePathMetadata,
  getFileFetchLog,
  mimeToExt,
} from "./lib";
import { saveResource } from "~/utils/storage";
import { fetchAndResizeImage, fetchWithTimeout, imageToDataUrl } from "~/utils/tools";
import { md5 } from "js-md5";

export const maxDimensionImage = 1024;
export const maxDimensionThumb = 256;

type ImageData = [string, string, HTMLImageElement, number, number]; // url, path, image, width, height

function getBaseDirectory(articleUrl: string): string {
  const parsedUrl = uri.parse(articleUrl);
  const path = parsedUrl.path;
  if (!path) return "";
  return path.endsWith("/") ? articleUrl : uri.resolve(articleUrl, ".");
}

async function extractImageUrls(doc: Document, articleUrl: string | null): Promise<ImageData[]> {
  const imgElements = doc.querySelectorAll("img");
  const imgData: ImageData[] = [];

  let baseDirectory = null;

  if (articleUrl !== null) {
    baseDirectory = getBaseDirectory(articleUrl);
  }

  imgElements.forEach((img) => {
    let imgUrl = img.src;

    // If the imgUrl is a relative URL or starts with '/', prepend the baseDirectory
    if (baseDirectory !== null && !imgUrl.match(/^[a-zA-Z]+:\/\//)) {
      imgUrl = new URL(imgUrl, baseDirectory).href;
    }

    const ext = imgUrl.split(".").pop();

    const hash = md5(imgUrl);

    const localPath = `${hash}.${ext}`;

    console.log("localPath", localPath);

    imgData.push([imgUrl, localPath, img, img.width, img.height]);
  });

  return imgData;
}

// Download all the images and create a thumbnail. Save them to dataUrls in storage.
async function downloadAndResizeImages(
  imageData: ImageData[],
  article: Article,
  sendMessage: (percent: number | null, message: string | null) => void
): Promise<void> {
  let imageCount = 0;
  let percent = 25;
  const endPercent = 93;

  const step = Math.round((endPercent - percent) / imageData.length / 2);

  let thumbnailPath: string | null = null;
  let thumbnailBlob: Blob | null = null;
  let maxArea = 0;

  for (const [url, localPath] of imageData) {
    sendMessage(percent, `downloading image ${imageCount + 1} of ${imageData.length}`);

    const ext = url.split(".").pop();

    // TODO: add support for .avif as on dgt.is
    const mimeType = mime.getType(ext ?? "image/jpeg") ?? "image/jpeg";

    try {
      const { blob, width, height } = await fetchAndResizeImage(url, maxDimensionImage);

      const dataUrl = await imageToDataUrl(blob);

      percent = percent + step;

      sendMessage(percent, `resizing image ${imageCount + 1} of ${imageData.length}`);

      const outputFilePath = await saveResource(localPath, article.slug, dataUrl, mimeType);

      console.log("outputFilePath", outputFilePath);
      console.log("dataurl", dataUrl);

      const relativePath = outputFilePath.replace("saves/" + article.slug + "/", "");

      const imgElement = imageData.find(([imgUrl]) => imgUrl === url)![2];
      imgElement.dataset.localPath = relativePath;
      imgElement.dataset.origSrc = url;
      // imgElement.dataset.path = outputFilePath;
      // imgElement.src = relativePath;
      imgElement.src = dataUrl;

      imageCount += 1;

      percent = percent + step;

      // thumbnail

      console.log("check thumb for localPath", localPath);

      const area = width * height;

      console.log("area", area);

      // Ignore small images
      if (area < 5000) {
        console.log("too small");
      }

      // Prefer images with more pixels (likely higher quality)
      else if (area > maxArea) {
        console.log("new maxArea", area);
        maxArea = area;
        thumbnailPath = localPath;
        thumbnailBlob = blob;
      }
    } catch (e) {
      console.error("error downloading and saving image", e);
    }
  }

  // make the thumbnail

  if (thumbnailBlob !== null) {
    const [url, localPath, img] = imageData.find(
      ([url, localPath]) => localPath === thumbnailPath
    )!;

    const { blob: resizedBlob } = await resizeImage(thumbnailBlob, maxDimensionThumb);

    const webpBlob = await convertToWebP(resizedBlob);

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error("Failed to read blob as data URL"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(webpBlob);
    });

    const outputFilePath = await saveResource(
      "thumbnail.webp.data",
      article.slug,
      dataUrl,
      webpBlob.type
    );

    console.log("outputFilePath", outputFilePath);
  }
}

async function processHtmlAndImages(
  article: Article,
  htmlText: string,
  sendMessage: (percent: number | null, message: string | null) => void
): Promise<string> {
  const parser = new DOMParser();
  const document = parser.parseFromString(htmlText, "text/html");
  // console.log(doc.querySelector('title').textContent);

  // const { document } = parseHTML(htmlText);

  // assigning a url allows relative paths to be resolved for images
  // const base = document.createElement("base");
  // base.href = article.url ?? ""; // Set your desired base URL here. will this work for all paths?

  const imageData = await extractImageUrls(document, article.url);

  console.log("imageData", imageData);

  sendMessage(25, "downloading images");

  await downloadAndResizeImages(imageData, article, sendMessage);

  sendMessage(95, "creating thumbnail");

  // const artObj = createArticleObject(article);

  return document.documentElement.outerHTML;
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

// Helper function to resize image to max dimension
export async function resizeImage(
  blob: Blob,
  maxDimension: number
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > height) {
        if (width > maxDimension) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw the resized image
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve({ blob: resizedBlob, width, height });
          } else {
            reject(new Error("Failed to resize image"));
          }
        },
        blob.type || "image/jpeg",
        0.8
      ); // Use original type or default to JPEG with 0.8 quality
    };

    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = URL.createObjectURL(blob);
  });
}

export async function convertToWebP(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob) {
            console.log("webpBlob", webpBlob);
            resolve(webpBlob);
          } else {
            reject(new Error("Failed to convert to WebP"));
          }
        },
        "image/webp",
        0.8
      );
    };
    img.onerror = () => reject(new Error("Failed to load image for WebP conversion"));
    img.src = URL.createObjectURL(blob);
  });
}

function guessContentType(input: string): string {
  // Trim input to remove leading/trailing whitespace
  const trimmedInput = input.trim();

  // Simplified HTML check: match any tag or <!DOCTYPE html>
  const htmlTagRegex = /^(<!DOCTYPE html>|<\s*[a-zA-Z][^>]*>.*<\/\s*[a-zA-Z][^>]*>)$/s;
  if (htmlTagRegex.test(trimmedInput)) {
    return "text/html";
  }

  // Markdown check: only look for headings
  const markdownHeadingRegex = /^#{1,6}\s+/m; // Match lines starting with 1-6 # symbols
  if (markdownHeadingRegex.test(trimmedInput)) {
    return "text/markdown";
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
  return "text/plain";
}

export function readabilityToArticle(
  html: string,
  contentType: string,
  url: string | null
): [Article, string] {
  var options = {};

  if (url !== null) {
    options = { url, contentType };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  // assigning a url allows relative paths to be resolved for images
  const base = document.createElement("base");
  base.href = url ?? ""; // Set your desired base URL here. will this work for all paths?

  // Append the base element into the head
  document.head.appendChild(base);

  let reader = new Readability(document);
  let readabilityResult = reader.parse();

  console.log("readabilityResult", readabilityResult);

  if (readabilityResult === null) {
    throw new Error("Readability did not parse");
  }

  if (readabilityResult.title == "") {
    readabilityResult.title = `${mimeToExt[contentType]} ${Date.now() + 0}`;
  }

  console.log(`title: ${readabilityResult.title}`);
  console.log(`length: ${readabilityResult.length}`);

  // TODO: handle case where title is not found?

  const slug = stringToSlug(readabilityResult.title);

  const content = readabilityResult.content;

  // sendMessage(15, "collecting images");

  // create a page with the html

  var pubDate: Date | null = null;

  if (readabilityResult.publishedTime) {
    pubDate = new Date(readabilityResult.publishedTime);

    if (isNaN(pubDate.getTime())) {
      pubDate = null;
    }
  }

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

  return [article, content];
}

export async function ingestHtml(
  storageClient: BaseClient | null,
  html: string,
  contentType: string,
  url: string | null,
  sendMessage: (percent: number | null, message: string | null) => void
): Promise<Article> {
  let [article, content] = readabilityToArticle(html, contentType, url);

  const fetchLog = getFileFetchLog(article.slug);

  // TODO: log each image. their original and final dimensions. and their final byte size

  // TODO: figure out if there is a way to append these lines one by one
  await storageClient?.storeFile(
    "text/plain",
    fetchLog,
    `readability finished for ${article.slug}`
  );

  // TODO: sanitize out the js before saving raw
  storageClient?.storeFile("text/html", getFilePathRaw(article.slug), html);

  sendMessage(20, "collecting images");

  console.log("content", content);

  content = await processHtmlAndImages(article, content, sendMessage);

  const rendered = ArticleTemplate({
    title: article.title,
    byline: article.author || "unknown author",
    published: generateInfoForArticle(article),
    readTime: `${article.readTimeMinutes} minute read`,
    content: content,
  });

  storageClient?.storeFile("text/html", getFilePathContent(article.slug), rendered);

  return article;
}

function generateRandomString() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomString = "";
  for (let i = 0; i < 16; i++) {
    randomString += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return randomString;
}

console.log(generateRandomString());

export async function ingestUrl(
  storageClient: BaseClient | null,
  url: string,
  sendMessage: (percent: number | null, message: string | null) => void
) {
  sendMessage(0, "starting");

  sendMessage(10, "fetching article");

  // TODO: create error if fetch times out. this happens if you are offline
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentTypeHeader = response.headers.get("content-type");

  if (!contentTypeHeader) {
    throw new Error("cant determine content type");
  }

  sendMessage(15, "scraping content");

  var article: Article | null = null;

  console.log(`contentTypeHeader = ${contentTypeHeader}`);

  try {
    const extension = mime.getExtension(contentTypeHeader);
    const mimeType = mime.getType(extension ?? "");

    if (!mimeType || !mimeToExt.hasOwnProperty(mimeType)) {
      throw new Error(`Unsupported content type: ${contentTypeHeader}`);
    }

    if (mimeType === "text/html") {
      article = await ingestHtml(
        storageClient,
        await response.text(),
        contentTypeHeader,
        url,
        sendMessage
      );

      // } else if (mimeType.subtype === 'pdf') {

      //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

      //   article = await articleFromPdf(checksum, url)

      //   finalizeFileLocation(tempLocalPath, article)

      //   // TODO: thumbnail

      // } else if (mimeType.type === 'image') {

      //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

      //   article = articleFromImage(mimeType, checksum, url)

      //   finalizeFileLocation(tempLocalPath, article)

      // createThumbnail([getFilePathContent(article.slug)], getSaveDirPath(article.slug))
    } else {
      throw new Error(`No handler for content type ${contentTypeHeader}`);
    }

    article.ingestSource = "url";
    article.mimeType = mimeType;
  } catch (error) {
    console.error(error);
    throw new Error("error during ingestion");
  }

  storageClient?.storeFile(
    "application/json",
    getFilePathMetadata(article.slug),
    JSON.stringify(article, null, 2)
  );

  // client.declareType("my-custom-type", {});

  sendMessage(
    100,
    `Finished saving: ${article.title.substring(0, 65)}${article.title.length > 65 ? "..." : ""}`
  );

  return article;
}

// export async function ingestCurrentPage(
//   storageClient: BaseClient | null,
//   html: string,
//   contentType: string,
//   url: string | null,
//   sendMessage: (percent: number | null, message: string | null) => void
// ) {
//   sendMessage(0, "start");

//   // const response = await fetch(`${corsProxy}${url}`);

//   const contentTypeHeader = "text/html"; //response.headers.get("content-type")

//   if (!contentTypeHeader) {
//     throw new Error("cant determine content type");
//   }

//   // sendMessage(10, "scraping article");

//   var article: Article | null = null;

//   console.log(`contentTypeHeader = ${contentTypeHeader}`);

//   try {
//     const extension = mime.getExtension(contentTypeHeader);
//     const mimeType = mime.getType(extension ?? "");

//     // const mimeType = new MIMEType(contentTypeHeader);

//     if (!mimeType || !mimeToExt.hasOwnProperty(mimeType)) {
//       throw new Error(`Unsupported content type: ${contentTypeHeader}`);
//     }

//     if (mimeType === "text/html") {
//       article = await ingestHtml2(storageClient, html, contentTypeHeader, url, sendMessage);

//       // } else if (mimeType.subtype === 'pdf') {

//       //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

//       //   article = await articleFromPdf(checksum, url)

//       //   finalizeFileLocation(tempLocalPath, article)

//       //   // TODO: thumbnail

//       // } else if (mimeType.type === 'image') {

//       //   let [tempLocalPath, checksum] = await storeBinary(mimeType, getReadableStream(response))

//       //   article = articleFromImage(mimeType, checksum, url)

//       //   finalizeFileLocation(tempLocalPath, article)

//       //   createThumbnail([getFilePath(article)], getSaveDirPath(article.slug))
//     } else {
//       throw new Error(`No handler for content type ${contentTypeHeader}`);
//     }

//     article.ingestSource = "url";
//     article.mimeType = mimeType;
//   } catch (error) {
//     console.error(error);
//     throw new Error("error during ingestion");
//   }

//   storageClient?.storeFile(
//     "application/json",
//     getFilePathMetadata(article.slug),
//     JSON.stringify(article, null, 2)
//   );

//   // TODO: dbManager.upsertArticle(article);

//   // if (existingArticleIndex != -1) {
//   //   db.data.articles[existingArticleIndex] = article;
//   // } else {
//   //   // keep the most recent at the top since its easier to read that way
//   //   db.data.articles.unshift(article);
//   // }

//   // await db.write();

//   // TODO: await createLocalHtmlList(dbManager);

//   sendMessage(100, `Finished saving: ${article.title.length > 200 ? article.title.substring(0, 200) + '...' : article.title}`);

//   return article;
// }

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
