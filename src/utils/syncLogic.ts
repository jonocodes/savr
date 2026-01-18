/**
 * Pure functions for article sync logic testing
 *
 * These functions contain the core sync logic extracted from storage.ts
 * to enable fast unit testing without RemoteStorage or IndexedDB dependencies.
 */

export interface SyncEvent {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface Article {
  slug: string;
  archived?: boolean;
  [key: string]: unknown;
}

export type SyncAction = 'add' | 'update' | 'delete' | 'skip';

/**
 * Determines what action to take for a RemoteStorage change event
 *
 * Logic:
 * - Deletion: oldValue exists, newValue undefined
 * - Update: newValue exists AND (oldValue exists OR article in DB)
 * - Addition: newValue exists, oldValue undefined, article not in DB, not already processed
 * - Skip: Already processed or already exists
 *
 * @param event - The RemoteStorage change event
 * @param existingArticle - The article from IndexedDB (null if not found)
 * @param alreadyProcessed - Whether this path was processed in current session
 * @returns The action to take: 'add', 'update', 'delete', or 'skip'
 */
export function determineSyncAction(
  event: SyncEvent,
  existingArticle: Article | null,
  alreadyProcessed: boolean
): SyncAction {
  // Deletion: file was removed
  if (event.oldValue !== undefined && event.newValue === undefined) {
    return 'delete';
  }

  // Addition or Update
  if (event.newValue !== undefined) {
    // Update detection: either in RemoteStorage cache or in IndexedDB
    // This handles both:
    // 1. Browser was open: oldValue exists (file in RS cache)
    // 2. Browser was closed: oldValue undefined, but article exists in DB
    const isUpdate = event.oldValue !== undefined || existingArticle !== null;

    // For new additions (not updates), skip if already processed this session
    if (!isUpdate && alreadyProcessed) {
      return 'skip';
    }

    // For new additions (not updates), skip if somehow already in DB
    // This shouldn't happen given the isUpdate logic above, but safety check
    if (!isUpdate && existingArticle) {
      return 'skip';
    }

    // Determine if update or add
    return isUpdate ? 'update' : 'add';
  }

  return 'skip';
}

/**
 * Identifies articles to delete (exist in local DB but not in remote listing)
 *
 * This handles the "catchup deletion" scenario where:
 * - Browser was closed
 * - Articles were deleted in another browser
 * - Browser reopens and needs to remove those articles
 *
 * @param localArticles - Articles currently in IndexedDB
 * @param remoteSlugs - Article slugs from RemoteStorage listing
 * @returns Array of article slugs to delete
 */
export function identifyDeletedArticles(
  localArticles: Article[],
  remoteSlugs: Set<string>
): string[] {
  return localArticles
    .filter(article => !remoteSlugs.has(article.slug))
    .map(article => article.slug);
}

/**
 * Identifies articles to add (exist in remote listing but not in local DB)
 *
 * This handles the "catchup addition" scenario where:
 * - Browser was closed
 * - Articles were added in another browser
 * - Browser reopens and needs to fetch those articles
 *
 * @param remoteSlugs - Article slugs from RemoteStorage listing
 * @param localArticles - Articles currently in IndexedDB
 * @param alreadyProcessed - Set of article paths processed this session
 * @returns Array of article slugs to fetch
 */
export function identifyMissingArticles(
  remoteSlugs: string[],
  localArticles: Article[],
  alreadyProcessed: Set<string>
): string[] {
  const localSlugs = new Set(localArticles.map(a => a.slug));

  return remoteSlugs.filter(slug => {
    const articlePath = `saves/${slug}/article.json`;
    return !localSlugs.has(slug) && !alreadyProcessed.has(articlePath);
  });
}

/**
 * Extracts article slug from a RemoteStorage path
 *
 * @param path - Path like "saves/article-slug/article.json"
 * @returns The article slug, or null if path doesn't match pattern
 */
export function extractSlugFromPath(path: string): string | null {
  const match = path.match(/saves\/([^/]+)\/article\.json/);
  return match ? match[1] : null;
}

/**
 * Determines if a sync is initial (empty DB) or subsequent (existing data)
 *
 * @param articleCount - Number of articles in IndexedDB
 * @returns true if this is an initial sync, false for subsequent
 */
export function isInitialSync(articleCount: number): boolean {
  return articleCount === 0;
}

/**
 * Calculates the appropriate total articles count for progress tracking
 *
 * For initial sync: Use listing count (shows real progress as articles download)
 * For subsequent sync: Use DB count (ignores dangling/corrupted articles)
 *
 * @param isInitial - Whether this is an initial sync
 * @param listingCount - Number of articles in RemoteStorage listing
 * @param dbCount - Number of articles in IndexedDB
 * @returns The appropriate total count to use for progress
 */
export function calculateProgressTotal(
  isInitial: boolean,
  listingCount: number,
  dbCount: number
): number {
  return isInitial ? listingCount : dbCount;
}
