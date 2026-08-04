// Provenance for an AI-generated summary: what produced it and when.
export type SummaryMeta = {
  model: string;
  provider: string;
  generatedAt: string; // ISO 8601 timestamp
  detailLevel?: number; // 0-4 detail level used, if available
};

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
  wordCount: number | null;
  readingWpm?: number | null; // Measured reading speed (wpm) from the last session; syncs so other devices can bootstrap
  progress: number;
  favorite?: boolean;
  summary?: string; // AI-generated summary of the article
  summaryMeta?: SummaryMeta; // Provenance of the AI summary (model, provider, when)
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
