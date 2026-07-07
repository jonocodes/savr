import Dexie, { type EntityTable } from "dexie";
import { Article } from "../../lib/src/models";

type DbType = Dexie & {
  articles: EntityTable<Article, "slug">;
};

const db: DbType = new Dexie("savrDb") as Dexie & {
  articles: EntityTable<Article, "slug">;
};

// Schema declaration:
db.version(2).stores({
  articles: "slug, ingestDate, state",
});

// v3: renamed readTimeMinutes -> defaultReadTimeMinutes
db.version(3).stores({}).upgrade((tx) =>
  tx
    .table("articles")
    .toCollection()
    .modify((article: Record<string, unknown>) => {
      if ("readTimeMinutes" in article) {
        article.defaultReadTimeMinutes = article.readTimeMinutes;
        delete article.readTimeMinutes;
      }
    })
);

// v4: store raw wordCount instead of the derived defaultReadTimeMinutes so the
// display can use any WPM without re-ingesting. Convert back via * 200.
db.version(4).stores({}).upgrade((tx) =>
  tx
    .table("articles")
    .toCollection()
    .modify((article: Record<string, unknown>) => {
      if ("defaultReadTimeMinutes" in article) {
        const minutes = article.defaultReadTimeMinutes as number | null;
        article.wordCount = minutes != null ? Math.round(minutes * 200) : null;
        delete article.defaultReadTimeMinutes;
      }
    })
);

export { db };
export type { DbType };
