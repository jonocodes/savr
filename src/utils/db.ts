import Dexie, { type EntityTable } from "dexie";
import { Article } from "../../lib/src/models";

// A single app-level event, recorded when something fails or is worth
// remembering. Kept in a bounded ring buffer (see utils/logging.ts) so it
// survives reloads and can be inspected from the Diagnostics screen — which
// matters on mobile, where the JS console isn't available.
export interface LogEntry {
  id?: number;
  timestamp: string;
  level: "error" | "warn" | "info";
  category: string;
  message: string;
  meta?: Record<string, unknown>;
}

type DbType = Dexie & {
  articles: EntityTable<Article, "slug">;
  logs: EntityTable<LogEntry, "id">;
};

const db: DbType = new Dexie("savrDb") as Dexie & {
  articles: EntityTable<Article, "slug">;
  logs: EntityTable<LogEntry, "id">;
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

// v5: persist app-level failure/event log for the Diagnostics screen.
db.version(5).stores({
  articles: "slug, ingestDate, state",
  logs: "++id, timestamp, level, category",
});

export { db };
export type { DbType };
