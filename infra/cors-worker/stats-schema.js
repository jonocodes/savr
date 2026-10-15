/**
 * Statistics schema shared by the proxy (writer) and infra/cors-stats (reader).
 *
 * Analytics Engine stores blobs and doubles positionally, so the field order
 * below is the schema: append new fields, never reorder. Both workers derive
 * column names (`blob3`, `double2`, …) from these lists instead of
 * hard-coding them, and the vocabularies are the only values the proxy emits
 * for each coarse field — the dashboard filters and labels are built from them.
 *
 * Platform-neutral (ADR 0003): plain data and pure functions, no runtime APIs.
 */

export const DATASET = "savr_cors_stats";

export const BLOB_FIELDS = [
  "country",
  "mime",
  "status",
  "cache",
  "host",
  "origin",
  "client",
  "errorKind",
];

export const DOUBLE_FIELDS = ["count", "durationMs", "bytes"];

export const MIME_BUCKETS = [
  "html", "image", "video", "audio", "font", "css",
  "js", "pdf", "json", "xml", "text", "other", "none",
];

export const CACHE_OUTCOMES = ["hit", "miss", "bypass"];

export const CLIENT_CLASSES = ["browser", "bot", "other", "none"];

export const FETCH_ERROR_KINDS = ["dns", "timeout", "blocked-redirect", "redirect-loop", "other"];

/** SQL column for a blob field, e.g. `blob("mime")` → `blob2`. */
export function blob(field) {
  const index = BLOB_FIELDS.indexOf(field);
  if (index < 0) throw new Error(`unknown stats blob field: ${field}`);
  return `blob${index + 1}`;
}

/** SQL column for a double field, e.g. `double("bytes")` → `double3`. */
export function double(field) {
  const index = DOUBLE_FIELDS.indexOf(field);
  if (index < 0) throw new Error(`unknown stats double field: ${field}`);
  return `double${index + 1}`;
}

/** Turn a core `onRequest` event plus the caller's country into an AE point. */
export function toDataPoint(event, country) {
  const values = { ...event, country: country || "XX", count: 1 };
  return {
    indexes: ["proxy"],
    blobs: BLOB_FIELDS.map((field) => String(values[field] ?? "")),
    doubles: DOUBLE_FIELDS.map((field) => Number(values[field] ?? 0)),
  };
}
