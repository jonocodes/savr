export type Article = {
  slug: string;
  title: string;
  url: string | null;
  state: string; //"unread", // unread, reading, finished, archived, deleted, ingesting. TODO: make enum or class
  publication: string | null;
  author: string | null;
  publishedDate: string | null | undefined; // TODO: perhaps this should be a datetime object
  ingestDate: string;
  ingestPlatform: string; // platform/web
  ingestSource: string;
  mimeType: string;
  readTimeMinutes: number | null;
  progress: number;
  summary?: string; // AI-generated summary of the article
  assetCount?: number; // Number of files stored for this article
  sizeBytes?: number; // Total storage size in bytes across all files
  // publishedTime: string | null;
};

// export type ArticleRenderType = {
//     // link: string;
//     // thumbnail: string;
//     // isReadable: boolean;
//     // isArchived: boolean;
//     infoForCard: string;
// } & ArticleType

export type ArticleRenderExtra = {
  // link: string;
  // thumbnail: string;
  // isReadable: boolean;
  // isArchived: boolean;
  infoForCard: string;
  fileName: string;
};

export type ArticleAndRender = {
  article: Article;
  extra: ArticleRenderExtra;
};

// export type Articles = {
//   articles: Article[];
// };
