/**
 * Pure reconciler for Savr sync.
 *
 * The reconciler computes what work needs to be done to bring local IndexedDB
 * in sync with the remote RemoteStorage listing. It has no side effects —
 * all IO (getListing, db.put, db.delete) is handled by the caller (storage.ts).
 *
 * Design principles:
 * - Each slug produces at most one Op per reconcile cycle.
 * - total = ops.length is known upfront, so the progress counter is monotonic.
 * - No session state (no "already processed" set) — each reconcile is stateless.
 * - Updates are modelled as a fetch Op (upsert into Dexie).
 */

/** A single unit of sync work. */
export type Op =
  | { type: "fetch"; slug: string }   // add or update — fetch article.json and upsert
  | { type: "delete"; slug: string }; // remove from local DB

/**
 * Parse a RemoteStorage getListing() result into an array of article slugs.
 *
 * The listing is a flat Record where keys ending in "/" are directories (article slugs)
 * and other keys are files. We only want the directories under saves/.
 */
export function parseListing(listing: Record<string, boolean>): string[] {
  return Object.keys(listing)
    .filter((key) => key.endsWith("/"))
    .map((key) => key.slice(0, -1)) // strip trailing slash
    .filter((slug) => slug.length > 0);
}

/**
 * Compute ops to synchronise local state with remote state.
 *
 * - slugs in remote but not local → fetch op (new article)
 * - slugs in local but not remote → delete op (article was removed on another device)
 * - slugs in both               → no op (change events handle in-place updates)
 *
 * The ops array has no duplicates and is stable (sorted alphabetically).
 */
export function reconcile(localSlugs: string[], remoteSlugs: string[]): Op[] {
  const local = new Set(localSlugs);
  const remote = new Set(remoteSlugs);

  const ops: Op[] = [];

  for (const slug of remote) {
    if (!local.has(slug)) {
      ops.push({ type: "fetch", slug });
    }
  }

  for (const slug of local) {
    if (!remote.has(slug)) {
      ops.push({ type: "delete", slug });
    }
  }

  return ops.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Extract the article slug from a RemoteStorage change event path.
 * Only matches article.json paths — returns null for raw.html, resources, etc.
 *
 * Examples:
 *   "saves/my-article/article.json" → "my-article"
 *   "saves/my-article/raw.html"     → null
 *   "saves/my-article/resources/x"  → null
 */
export function parseChangePath(path: string): string | null {
  const match = path.match(/^saves\/([^/]+)\/article\.json$/);
  return match ? match[1] : null;
}

/**
 * Derive the Op for a single RS change event.
 *
 * hasNew=true  → fetch op (add or update)
 * hasNew=false → delete op
 *
 * Returns null if the path is not an article.json path.
 */
export function opFromChange(path: string, hasNew: boolean): Op | null {
  const slug = parseChangePath(path);
  if (!slug) return null;
  return hasNew ? { type: "fetch", slug } : { type: "delete", slug };
}
