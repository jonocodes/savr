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

// Rename readTimeMinutes -> defaultReadTimeMinutes to clarify it is the
// baseline (default-wpm) estimate, not the user-adjusted display value.
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

export { db };
export type { DbType };
