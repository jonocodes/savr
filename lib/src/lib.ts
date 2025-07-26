import Mustache from "mustache";
import { ArticleAndRender, ArticleRenderExtra, Article } from "./models";
// import { version } from '../package.json' with { type: "json" };

import { listTemplateMoustache } from "./list";

export const DB_FILE_NAME = "db.json";

// TODO: maybe dont need this mapping since the subtype is the extension
export const mimeToExt: Record<string, string> = {
  "text/html": "html",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  // application/epub+zip
};

// type ImageData = [string, string, HTMLImageElement]; // url, path, image

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
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024;
    index++;
  }
  return `${bytes.toFixed(2)} ${units[index]}`;
}

export function generateInfoForCard(article: Article): string {
  var result = "";

  if (article.author != null && article.author != "") {
    result = article.author;
  }

  if (article.publishedDate != null && article.publishedDate != undefined) {
    const pubDate = new Date(article.publishedDate);

    if (result == "") {
      result = pubDate.toDateString();
    } else {
      result = result + ", " + pubDate.toDateString();
    }
  }

  if (article.readTimeMinutes != null && article.readTimeMinutes != 0) {
    let read = `${article.readTimeMinutes} minute read`;

    if (article.progress != null && article.progress != 0) {
      read = `${read} • ${article.progress}%`;
    }

    if (result == "") {
      result = read;
    } else {
      result = `${result} • ${read}`;
    }
  }

  return result;
}

// export function upsertArticleToList(articles: Article[], article: Article) {
//   const existingArticleIndex = articles.findIndex((a) => a.slug === article.slug);
//   if (existingArticleIndex !== -1) {
//     articles[existingArticleIndex] = article;
//   } else {
//     articles.unshift(article);
//   }
// }

// export function getArticleBySlug(articles: Article[], slug: string): Article | undefined {
//   return articles.find((article: Article) => article.slug === slug);
// }

export function generateInfoForArticle(article: Article): string {
  var result = "";

  if (article.url != null) {
    const domain = extractDomain(article.url);

    if (domain != null) {
      result = `<a href=${article.url}>${domain}</a>`;
    }
  }

  if (article.publishedDate != null && article.publishedDate != undefined) {
    const pubDate = new Date(article.publishedDate);

    if (result == "") {
      result = pubDate.toDateString();
    } else {
      result = result + " &#x2022; " + pubDate.toDateString();
    }
  }

  return result;
}

// export function filterAndPrepareArticles(articles: Article[]): ArticleAndRender[] {
//   const readable: ArticleAndRender[] = [];

//   for (const article of articles) {
//     const articleAndRender = toArticleAndRender(article);

//     if (article.state != "deleted") readable.push(articleAndRender);
//   }

//   return readable;
// }

// export function toArticleAndRender(article: Article): ArticleAndRender {
//   // const mimeType = new MIMEType(article.mimeType)
//   let ext = mimeToExt[article.mimeType];

//   // if (mimeType.type == "text") {
//   if (article.mimeType.startsWith("text/")) {
//     ext = "html";
//   }

//   const newValues: ArticleRenderExtra = {
//     infoForCard: generateInfoForCard(article),
//     fileName: `index.${ext}`,
//   };

//   return {
//     article: article,
//     extra: newValues,
//   };
// }

// export function articlesToRender(articles: Article[]): [ArticleAndRender[], ArticleAndRender[]] {
//   const readable: ArticleAndRender[] = [];
//   const archived: ArticleAndRender[] = [];

//   for (const article of articles) {
//     const articleAndRender = toArticleAndRender(article);

//     if (article.state === "archived") archived.push(articleAndRender);
//     else if (article.state != "deleted") readable.push(articleAndRender);
//   }

//   return [readable, archived];
// }

export function renderListTemplate(view: object) {
  return Mustache.render(listTemplateMoustache, view);
}

export function getFilePathContent(slug: string): string {
  return `saves/${slug}/index.html`;
}

export function getFilePathMetadata(slug: string): string {
  return `saves/${slug}/article.json`;
}

export function getFilePathRaw(slug: string): string {
  return `saves/${slug}/raw.html`;
}

export function getFileFetchLog(slug: string): string {
  return `saves/${slug}/fetch.log`;
}

export function getFilePathThumbnail(slug: string): string {
  return `saves/${slug}/resources/thumbnail.webp.data`;
}
