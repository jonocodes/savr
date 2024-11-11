export type ArticleType = {
    slug: string;
    title: string;
    url: string | null;
    state: string; //"unread", // unread, reading, finished, archived, deleted, ingesting
    publication: string | null;
    author: string | null;
    publishedDate: string | null | undefined; // TODO: perhaps this should be a datetime object
    ingestDate: string;
    ingestPlatform: string; // platform/web
    ingestSource: string;
    mimeType: string;
    readTimeMinutes: number | null;
    progress: number;
};
  
  
  // type ArticleRenderType = {
  //   link: string;
  //   thumbnail: string;
  //   isReadable: boolean;
  //   isArchived: boolean;
  //   infoForCard: string;
  // } & ArticleType
  
  
export type Articles = {
    articles: ArticleType[];
};
