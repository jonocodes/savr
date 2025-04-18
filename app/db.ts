import Dexie, { type EntityTable } from "dexie";
import { Article } from "../lib/src/models";

const db = new Dexie("savrDb") as Dexie & {
  articles: EntityTable<Article, "slug">;
};

// Schema declaration:
db.version(1).stores({
  articles: "slug, ingestDate",
});

export { db };
