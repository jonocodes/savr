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

export { db };
export type { DbType };
