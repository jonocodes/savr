import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../lib/src/models";
// import extensionConnector from "./extensionConnector";
import { environmentConfig } from "~/config/environment";
import { determineSyncAction, extractSlugFromPath, type SyncEvent } from "./syncLogic";

// Sync progress tracking
export interface SyncProgress {
  isSyncing: boolean;
  totalArticles: number;
  processedArticles: number;
  phase: "initial" | "ongoing" | "idle";
}

type SyncProgressListener = (progress: SyncProgress) => void;

let syncProgressListeners: SyncProgressListener[] = [];
let currentSyncProgress: SyncProgress = {
  isSyncing: false,
  totalArticles: 0,
  processedArticles: 0,
  phase: "idle",
};

export function subscribeSyncProgress(listener: SyncProgressListener): () => void {
  syncProgressListeners.push(listener);
  // Immediately notify with current state
  listener(currentSyncProgress);
  // Return unsubscribe function
  return () => {
    syncProgressListeners = syncProgressListeners.filter((l) => l !== listener);
  };
}

function notifySyncProgress(progress: Partial<SyncProgress>) {
  currentSyncProgress = { ...currentSyncProgress, ...progress };
  syncProgressListeners.forEach((listener) => listener(currentSyncProgress));
}

// Notification system for sync events
export type SyncNotificationType = "connect-replacing-articles" | "disconnect-removed-articles";

export interface SyncNotification {
  type: SyncNotificationType;
  message: string;
}

type NotifyCallback = (notification: SyncNotification) => void;

let notifyCallback: NotifyCallback | null = null;

/**
 * Register a callback to show notifications for sync events.
 * The UI should register this to show toast messages.
 */
export function setSyncNotifyCallback(callback: NotifyCallback | null): void {
  notifyCallback = callback;
}

// declare global {
//   interface Window {
//     extensionConnector: typeof extensionConnector;
//   }
// }

let store: Promise<{ remoteStorage: RemoteStorage; client: BaseClient }> | null = null;

function init() {
  if (!store) {
    store = (async () => {
      const remoteStorage = await initRemote();

      const client = remoteStorage.scope("/savr/");

      return { remoteStorage, client };
    })();
  }
  return store;
}

let remotePrms;

async function recursiveList(client: BaseClient, path = ""): Promise<string[]> {
  try {
    // Defensive checks
    if (!client) {
      console.error("recursiveList: No client provided");
      return [];
    }

    if (typeof path !== "string") {
      console.error("recursiveList: Invalid path type", { path, type: typeof path });
      return [];
    }

    // Ensure path is properly formatted
    const safePath = path || "";
    // console.log("recursiveList: Getting listing for path:", safePath, "type:", typeof safePath);

    const listing = await client.getListing(safePath);
    // console.log("recursiveList: Got listing for", safePath, listing);

    let files: string[] = [];
    for (const [name, _isFolder] of Object.entries(listing as Record<string, boolean>)) {
      // console.log("recursiveList: Processing item", { name, _isFolder, path: safePath });
      // Type assertion here
      if (name.endsWith("/")) {
        // Recursively list subfolder
        // console.log("recursiveList: Recursing into subfolder:", safePath + name);
        const subFiles = await recursiveList(client, safePath + name);
        // console.log("recursiveList: Got subfiles for", safePath + name, subFiles);
        files = files.concat(subFiles);
      } else {
        // console.log("recursiveList: Adding file:", safePath + name);
        files.push(safePath + name);
      }
    }
    // console.log("recursiveList: Returning files for", safePath, files);
    return files;
  } catch (error) {
    console.error("recursiveList: Failed to get listing for", path, error);
    return [];
  }
}

async function glob(client: BaseClient, pattern: string, basePath = ""): Promise<string[]> {
  try {
    // Defensive checks
    if (!client) {
      console.error("glob: No client provided");
      return [];
    }

    if (typeof pattern !== "string") {
      console.error("glob: Invalid pattern type", { pattern, type: typeof pattern });
      return [];
    }

    if (typeof basePath !== "string") {
      console.error("glob: Invalid basePath type", { basePath, type: typeof basePath });
      return [];
    }

    // console.log("glob: Starting with pattern:", pattern, "basePath:", basePath);
    const allFiles = await recursiveList(client, basePath);
    // console.log("glob: Got all files:", allFiles);

    const filteredFiles = allFiles.filter((filePath: string) => {
      const matches = minimatch(filePath, pattern);
      // console.log("glob: Checking file", filePath, "against pattern", pattern, "matches:", matches);
      return matches;
    });

    // console.log("glob: Final filtered files:", filteredFiles);
    return filteredFiles;
  } catch (error) {
    console.error("glob: Failed to process pattern", pattern, "basePath", basePath, error);
    return [];
  }
}

// Process a single article.json file and insert it into IndexedDB immediately
async function processArticleFile(
  client: BaseClient,
  filePath: string,
  retryCount = 0
): Promise<void> {
  const maxRetries = 5;
  const retryDelay = 500; // ms

  try {
    console.log(
      `📖 Processing article file: ${filePath}${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ""}`
    );
    const file = (await client.getFile(filePath)) as { data: string };

    if (!file || !file.data) {
      // File might not be cached yet, retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`  ⏳ File not cached yet, retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return processArticleFile(client, filePath, retryCount + 1);
      }
      console.error(`  ✗ File is empty or invalid after ${maxRetries} retries: ${filePath}`);
      throw new Error(`File is empty or invalid after ${maxRetries} retries: ${filePath}`);
    }

    let article: Article;
    if (typeof file.data === "object") {
      article = file.data as Article;
    } else {
      article = JSON.parse(file.data);
    }

    if (!article || !article.slug) {
      console.error(`  ✗ Invalid article data: missing slug in ${filePath}`);
      throw new Error(`Invalid article data: missing slug in ${filePath}`);
    }

    // Insert immediately into IndexedDB
    await db.articles.put(article);
    console.log(`  ✅ Inserted: ${article.slug}`);

    // Verify the article was actually saved
    const savedArticle = await db.articles.get(article.slug);
    if (!savedArticle) {
      console.error(`  ✗ Article was not saved to database: ${article.slug}`);
    }
  } catch (error) {
    // If it's a parsing error and we haven't retried, try again (file might be partially cached)
    if (retryCount < maxRetries && error instanceof SyntaxError) {
      console.log(
        `  ⏳ JSON parse error, file might be partially cached, retrying in ${retryDelay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return processArticleFile(client, filePath, retryCount + 1);
    }
    console.error(`  ✗ Error processing article file ${filePath}:`, error);
    // Re-throw to allow callers to handle the error
    throw error;
  }
}

// Process missing articles using cached listing (avoids slow glob operation)
async function processMissingArticles(
  client: BaseClient,
  cachedListing: Record<string, any>,
  processedSet: Set<string>
) {
  console.log("🔍 Processing missing articles from cached listing");

  // Get all article slugs from the listing (strip trailing slashes from directory names)
  const articleSlugs = Object.keys(cachedListing)
    .filter((key) => cachedListing[key] === true)
    .map((key) => (key.endsWith("/") ? key.slice(0, -1) : key));
  console.log(`   Found ${articleSlugs.length} articles in listing`);

  // Check which ones are missing from IndexedDB
  const missingArticles: string[] = [];
  for (const slug of articleSlugs) {
    const articlePath = `saves/${slug}/article.json`;

    // Skip if already processed in this session
    if (processedSet.has(articlePath)) {
      continue;
    }

    // Check if exists in IndexedDB
    const exists = await db.articles.get(slug);
    if (!exists) {
      missingArticles.push(articlePath);
      console.log(`      Missing: ${slug}`);
    }
  }

  console.log(`   📥 ${missingArticles.length} articles missing from DB, fetching...`);

  if (missingArticles.length === 0) {
    console.log("   ✓ No missing articles to process");
    return;
  }

  // Process missing articles
  let processed = 0;
  for (const articlePath of missingArticles) {
    try {
      await processArticleFile(client, articlePath);
      processedSet.add(articlePath);
      processed++;
      // Use actual DB count for progress, not processedSet size
      const articlesInDb = await db.articles.count();
      notifySyncProgress({
        processedArticles: articlesInDb,
      });
    } catch (error) {
      console.error(`   ❌ Failed to process ${articlePath}:`, error);
    }
  }

  console.log(`   ✅ Processed ${processed} missing articles`);
}

// Process deleted articles (articles in DB but not in RemoteStorage listing)
// Returns the list of articles that would be deleted, or actually deletes them based on shouldDelete flag
async function processDeletedArticles(
  cachedListing: Record<string, any>,
  shouldDelete: boolean = true
): Promise<string[]> {
  console.log("🗑️  Checking for deleted articles");

  // Get all article slugs from the RemoteStorage listing
  const remoteArticleSlugs = new Set(
    Object.keys(cachedListing)
      .filter((key) => cachedListing[key] === true)
      .map((key) => (key.endsWith("/") ? key.slice(0, -1) : key))
  );

  console.log(`   Remote has ${remoteArticleSlugs.size} articles`);

  // Get all articles from IndexedDB
  const localArticles = await db.articles.toArray();
  console.log(`   Local DB has ${localArticles.length} articles`);

  // Find articles in DB but not in RemoteStorage
  const articlesToDelete: string[] = [];
  for (const article of localArticles) {
    if (!remoteArticleSlugs.has(article.slug)) {
      articlesToDelete.push(article.slug);
      console.log(`      Not on remote: ${article.slug}`);
    }
  }

  if (articlesToDelete.length === 0) {
    console.log("   ✓ No articles to remove");
    return [];
  }

  if (!shouldDelete) {
    console.log(`   ⚠️ Found ${articlesToDelete.length} articles not on remote (not deleting yet)`);
    return articlesToDelete;
  }

  console.log(`   🗑️  Removing ${articlesToDelete.length} articles from DB`);

  // Delete articles from IndexedDB
  for (const slug of articlesToDelete) {
    try {
      await db.articles.delete(slug);
      console.log(`   ✓ Deleted ${slug}`);
    } catch (error) {
      console.error(`   ❌ Failed to delete ${slug}:`, error);
    }
  }

  console.log(`   ✅ Removed ${articlesToDelete.length} articles`);
  return articlesToDelete;
}

function initRemote() {
  remotePrms = new Promise<RemoteStorage>((resolve) => {
    const remoteStorage = new RemoteStorage({
      logging: false,
      // cache: false
      //   modules: ["sync"],
    });
    remoteStorage.setApiKeys({
      googledrive: environmentConfig.apiKeys.googleDrive,
      dropbox: environmentConfig.apiKeys.dropbox,
    });
    remoteStorage.access.claim("savr", "rw");

    const client = remoteStorage.scope("/savr/");

    remoteStorage.caching.enable("/savr/");

    // Track sync state to prevent clearing database during active sync
    let isSyncing = false;
    let hasCompletedInitialSync = false;
    let hasProcessedAfterFirstCycle = false;
    let isNetworkOffline = false; // Track network state to distinguish user disconnect from network loss
    let isPreparingForSync = false; // Block change events while clearing local articles

    remoteStorage.on("ready", function () {
      console.info("🔵 remoteStorage ready");
      resolve(remoteStorage);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`🟢 remoteStorage connected to "${userAddress}"`);

      // Block change events while we prepare
      isPreparingForSync = true;

      // Check if we have local articles before starting sync
      const existingArticleCount = await db.articles.count();

      // Always clear local articles before sync to avoid flickering
      if (existingArticleCount > 0) {
        console.info(
          `   ⚠️ Found ${existingArticleCount} local articles - clearing before sync`
        );

        // Notify the user that local articles are being replaced
        if (notifyCallback) {
          notifyCallback({
            type: "connect-replacing-articles",
            message: `Replacing ${existingArticleCount} local article${existingArticleCount !== 1 ? "s" : ""} with synced data`,
          });
        }

        // Clear local articles so sync starts fresh
        await db.articles.clear();
        console.info("   ✅ Local articles cleared");
      }

      // Now allow change events to be processed
      isPreparingForSync = false;

      isSyncing = true;
      hasProcessedAfterFirstCycle = false; // Reset for this connection
      hasSetTotalArticles = false; // Allow fetching total for new connection
      hasFinalizedTotal = false; // Allow updating total for new sync

      // After potential clearing, this is now an initial sync
      isInitialSync = true;

      // Notify UI that RemoteStorage sync is starting
      notifySyncProgress({
        isSyncing: true,
        phase: "initial",
        totalArticles: 0, // Don't know yet
        processedArticles: 0,
      });
      console.info(`   📊 Starting sync`);
      // Sync is automatically triggered on connection
      // The sync-done event will fire when sync completes
    });

    // This event fires after the initial sync completes and files are cached locally
    // Check for any articles that might have been missed by the incremental change handler
    remoteStorage.on("sync-done", async () => {
      console.info("RemoteStorage sync-done - checking for any missed articles");
      // Wait a bit to ensure change events have fired
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check how many articles change events have already processed
      const articlesInDb = await db.articles.count();
      const expectedTotal = currentSyncProgress.totalArticles;
      console.info(
        `   → Change events processed ${processedArticles.size} articles, ${articlesInDb} in DB, expected ${expectedTotal} total`
      );

      // Fetch fresh listing to check for additions and deletions
      // (fast operation, avoids slow glob)
      try {
        console.info("   → Fetching article listing to check for sync discrepancies");
        const listing = (await client.getListing("saves/")) as Record<string, any>;
        if (listing) {
          // Process missing articles (additions made while browser was closed)
          const missingArticles = expectedTotal > 0 ? expectedTotal - articlesInDb : 0;
          if (missingArticles > 0 || articlesInDb < 10) {
            console.info(`   → Missing ${missingArticles} articles, processing them`);
            await processMissingArticles(client, listing, processedArticles);
          } else {
            console.info("   → All articles synced via change events");
          }

          // Process deleted articles (articles in local DB but not on remote)
          // Since user confirmed at connect time, we can safely delete these
          await processDeletedArticles(listing, true);
        } else {
          console.warn("   ⚠️ Failed to get listing, cannot check for sync discrepancies");
        }
      } catch (error) {
        console.error("   ❌ Error fetching listing:", error);
      }

      isSyncing = false;
      hasCompletedInitialSync = true;
      hasFinalizedTotal = true; // Lock the total to prevent resetting

      // Notify UI that sync is complete
      // Set total to actual DB count (accounts for any failed/dangling articles)
      const finalCount = await db.articles.count();
      notifySyncProgress({
        isSyncing: false,
        phase: "idle",
        totalArticles: finalCount,
        processedArticles: finalCount,
      });
      console.info(`✅ Initial sync complete - ${finalCount} articles in database`);
    });

    // Also listen for when ongoing sync cycles complete
    remoteStorage.on("sync-req-done", async () => {
      console.info("🔄 RemoteStorage sync-req-done - sync cycle completed");

      // Check for any articles that weren't caught by change events
      // This handles the case where:
      // 1. RemoteStorage loops on sync-req-done without firing sync-done (initial sync)
      // 2. Manual sync triggered after initial sync (subsequent sync to pull new articles)
      //
      // For initial sync: only process once (hasProcessedAfterFirstCycle = false)
      // For subsequent syncs: always check for missing articles (hasCompletedInitialSync = true)
      const isInitialSyncCycle = isSyncing && !hasProcessedAfterFirstCycle;
      const isSubsequentSync = hasCompletedInitialSync && !isSyncing;

      if (isInitialSyncCycle || isSubsequentSync) {
        if (isInitialSyncCycle) {
          hasProcessedAfterFirstCycle = true;
        }

        // Check how many articles change events have already processed
        const articlesInDb = await db.articles.count();
        const expectedTotal = currentSyncProgress.totalArticles;
        console.info(
          `   → Change events processed ${processedArticles.size} articles, ${articlesInDb} in DB, expected ${expectedTotal} total`
        );

        // Fetch listing to check for additions and deletions
        try {
          console.info("   → Fetching article listing to check for sync discrepancies");
          const listing = (await client.getListing("saves/")) as Record<string, any>;
          if (listing) {
            // Process missing articles (additions made while browser was closed or by another browser)
            const remoteCount = Object.keys(listing).filter((key) => listing[key] === true).length;
            const missingArticles = remoteCount - articlesInDb;
            if (missingArticles > 0 || articlesInDb < remoteCount) {
              console.info(`   → Missing ${missingArticles} articles (remote: ${remoteCount}, local: ${articlesInDb}), processing them`);
              await processMissingArticles(client, listing, processedArticles);
            } else {
              console.info("   → All articles synced via change events");
            }

            // Process deleted articles (articles in local DB but not on remote)
            await processDeletedArticles(listing, true);
          } else {
            console.warn("   ⚠️ Failed to get listing, cannot check for sync discrepancies");
          }
        } catch (error) {
          console.error("   ❌ Error fetching listing:", error);
        }

        // Only update sync state if this is the initial sync cycle
        if (isInitialSyncCycle) {
          isSyncing = false;
          hasCompletedInitialSync = true;
          hasFinalizedTotal = true; // Lock the total to prevent resetting
        }

        // Notify UI that sync is complete
        // Set total to actual DB count (accounts for any failed/dangling articles)
        const finalCount = await db.articles.count();
        notifySyncProgress({
          isSyncing: false,
          phase: "idle",
          totalArticles: finalCount,
          processedArticles: finalCount,
        });
        console.info(`   ✅ Sync complete - ${finalCount} articles in database`);
      }
    });

    remoteStorage.on("not-connected", function () {
      console.info("⚪ remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", async function () {
      const articleCount = await db.articles.count();
      console.warn(`🔴 remoteStorage disconnected - ${articleCount} articles in local database`);
      console.warn(
        `   isSyncing: ${isSyncing}, hasCompletedInitialSync: ${hasCompletedInitialSync}, isNetworkOffline: ${isNetworkOffline}`
      );

      // IMPORTANT: Only clear database if this is a deliberate user disconnect
      // Do NOT clear during sync operations, reconnect cycles, or network interruptions
      if (!isSyncing && hasCompletedInitialSync && !isNetworkOffline) {
        console.info("   → User-initiated disconnect detected, clearing local data");

        if (articleCount > 0) {
          // Notify the user that articles are being removed
          if (notifyCallback) {
            notifyCallback({
              type: "disconnect-removed-articles",
              message: `Removed ${articleCount} article${articleCount !== 1 ? "s" : ""} from device. Reconnect to get them back.`,
            });
          }

          try {
            await db.articles.clear();
            console.info("   ✅ Cleared all articles from local database");
          } catch (error) {
            console.error("   ❌ Failed to clear articles from local database:", error);
          }
        }
      } else {
        console.info("   → Preserving local database during sync/reconnect cycle");
      }

      // ALWAYS reset sync state flags on any disconnect so next connection triggers fresh sync
      // This is critical for multi-browser sync to work - when reconnecting, we need to
      // check the server for new articles that were added by other browsers
      processedArticles.clear();
      hasCompletedInitialSync = false;
      hasProcessedAfterFirstCycle = false;
      isSyncing = false;
      console.info("   → Reset sync state flags for fresh sync on next connection");
    });

    remoteStorage.on("error", function (err) {
      console.error(`🚨 remoteStorage error:`, err);
      // Reset sync flag on error to prevent stuck state
      if (isSyncing) {
        console.warn("   → Resetting sync flag due to error");
        isSyncing = false;
      }
    });

    remoteStorage.on("network-offline", () => {
      console.info(`📴 remoteStorage network offline`);
      isNetworkOffline = true;
    });

    remoteStorage.on("network-online", () => {
      console.info(`📶 remoteStorage network online - sync will resume`);
      isNetworkOffline = false;
      // Sync automatically restarts when network comes back
      if (hasCompletedInitialSync) {
        isSyncing = true;
      }
    });

    remoteStorage.on("wire-busy", () => {
      console.debug(`⚡ remoteStorage wire-busy - network activity started`);
    });

    remoteStorage.on("wire-done", () => {
      console.debug(`⚡ remoteStorage wire-done - network activity finished`);
    });

    // Track which articles we've already processed to avoid duplicates
    // This is shared between the change handler and sync-done handler
    const processedArticles = new Set<string>();

    // Track if we've fetched the total article count for progress reporting
    let hasSetTotalArticles = false;
    let hasFinalizedTotal = false; // Prevent resetting total after sync completes
    let isInitialSync = false; // True if DB was empty when we connected

    // Listen for change events from RemoteStorage sync
    // This handles when files are added/modified/deleted on the server by other clients
    // Process articles incrementally as they're synced
    client.on("change", async (event: any) => {
      // Skip processing while we're clearing local articles
      if (isPreparingForSync) {
        console.debug("   ⏸️ Skipping change event while preparing for sync");
        return;
      }

      const path = event.path || event.relativePath || "";
      const isArticleFile = path.endsWith("/article.json");

      // Check for both relative (saves/) and absolute (/savr/saves/) paths
      const isArticleChange =
        (path.startsWith("saves/") ||
          path.startsWith("/savr/saves/") ||
          path.includes("/saves/")) &&
        isArticleFile;

      if (isArticleChange) {
        // Normalize path to relative format for tracking
        const normalizedPath = path.startsWith("/savr/") ? path.slice(6) : path;

        // On first article change, get total count and update progress
        // Don't update if we've already finalized the total (accounts for dangling articles)
        if (!hasSetTotalArticles && isSyncing && !hasFinalizedTotal) {
          hasSetTotalArticles = true;
          try {
            const listing = (await client.getListing("saves/")) as Record<string, any>;
            if (listing) {
              const articlesInDb = await db.articles.count();

              // If this is NOT an initial sync (we had articles when connected), use DB count as total
              // This accounts for dangling articles and gives accurate progress on subsequent syncs
              // If this IS an initial sync, always use the listing count
              if (!isInitialSync) {
                // Subsequent sync - use DB count as the canonical total (ignores dangling)
                console.log(
                  `   📊 Using DB count as total: ${articlesInDb} articles (ignores dangling)`
                );
                notifySyncProgress({
                  totalArticles: articlesInDb,
                  processedArticles: articlesInDb,
                });
                hasFinalizedTotal = true; // Mark as finalized immediately
              } else {
                // Initial sync - use listing count to show real progress
                const totalArticles = Object.keys(listing).filter(
                  (key) => listing[key] === true
                ).length;
                console.log(`   📊 Total articles to sync: ${totalArticles}`);
                notifySyncProgress({
                  totalArticles,
                  processedArticles: articlesInDb,
                });
              }
            }
          } catch (error) {
            console.warn("   ⚠️ Failed to get article count:", error);
          }
        }

        // Determine what action to take using extracted sync logic
        const slug = extractSlugFromPath(normalizedPath);
        const existingArticle = slug ? ((await db.articles.get(slug)) ?? null) : null;
        const alreadyProcessed = processedArticles.has(normalizedPath);

        const syncEvent: SyncEvent = {
          path: normalizedPath,
          oldValue: event.oldValue,
          newValue: event.newValue,
        };

        const action = determineSyncAction(syncEvent, existingArticle, alreadyProcessed);

        if (action === "add" || action === "update") {
          // Track that we're processing this article
          processedArticles.add(normalizedPath);

          // Process the article file
          try {
            await processArticleFile(client, normalizedPath);
            // Update progress after processing each article
            if (isSyncing) {
              const articlesInDb = await db.articles.count();
              notifySyncProgress({
                processedArticles: articlesInDb,
              });
            }
          } catch (error) {
            console.error(`   ❌ Failed to process article file:`, error);
            // Remove from processed set so it can be retried
            processedArticles.delete(normalizedPath);
          }
        } else if (action === "delete") {
          // File was deleted
          processedArticles.delete(normalizedPath);

          if (slug) {
            try {
              await db.articles.delete(slug);
            } catch (error) {
              console.error(`Failed to delete article ${slug}:`, error);
            }
          }
        }
        // If action is 'skip', do nothing
      }
    });
  });

  return remotePrms;
}

// Saves things like images to dataurls in remote storage
export async function saveResource(
  localPath: string,
  slug: string,
  dataUrl: string,
  mimeType: string
): Promise<string> {
  const fullPath = `saves/${slug}/resources/${localPath}`;

  console.log("saving resource", fullPath);

  const storage = await init();

  await storage.client.storeFile(mimeType, fullPath, dataUrl);

  console.log(`Saved resource: ${localPath}`);

  return localPath;
}

// Manually trigger sync of missing articles (for diagnostics button)
export async function syncMissingArticles(): Promise<string> {
  try {
    const storage = await init();
    const articlesInDb = await db.articles.count();
    const expectedTotal = currentSyncProgress.totalArticles;

    console.log(`🔧 Manual sync: DB has ${articlesInDb}, expected ${expectedTotal}`);

    // Fetch fresh listing
    const listing = (await storage.client.getListing("saves/")) as Record<string, any>;
    if (!listing) {
      return "Failed to fetch article listing";
    }

    // Count articles in listing
    const articleSlugsInListing = Object.keys(listing)
      .filter((key) => listing[key] === true)
      .map((key) => (key.endsWith("/") ? key.slice(0, -1) : key));

    console.log(`🔧 Listing has ${articleSlugsInListing.length} articles`);
    console.log(`🔧 Expected total was ${expectedTotal}`);

    // Check actual missing articles
    const actuallyMissing: string[] = [];
    for (const slug of articleSlugsInListing) {
      const exists = await db.articles.get(slug);
      if (!exists) {
        actuallyMissing.push(slug);
        console.log(`   Missing: ${slug}`);
      }
    }

    // Process missing articles (additions)
    const processedSet = new Set<string>();
    if (actuallyMissing.length > 0) {
      await processMissingArticles(storage.client, listing, processedSet);
    }

    // Process deleted articles (deletions)
    await processDeletedArticles(listing);

    const newCount = await db.articles.count();
    const added = Math.max(0, newCount - articlesInDb);
    const removed = Math.max(0, articlesInDb - newCount);

    if (added === 0 && removed === 0) {
      return `No discrepancies found. DB: ${articlesInDb}, Listing: ${articleSlugsInListing.length}, Expected: ${expectedTotal}`;
    }

    return `Synced: +${added} articles, -${removed} deleted. Now: ${newCount}/${articleSlugsInListing.length}`;
  } catch (error) {
    console.error("Manual sync failed:", error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function calculateTotalStorage(): Promise<{
  size: number;
  files: number;
}> {
  let size = 0;
  let files = 0;

  try {
    // Calculate RemoteStorage usage if available
    const store = await init();
    if (store && store.client) {
      try {
        const allFiles = await recursiveList(store.client, "");
        files = allFiles.length;

        // TODO: this is not working as expected. its not seeing all the files???  ???

        console.log("calculateTotalStorage", allFiles);

        // Calculate size of files in RemoteStorage (use local cache only)
        for (const filePath of allFiles) {
          try {
            const file = (await store.client.getFile(filePath, false)) as { data: string };
            if (file && file.data) {
              size += new Blob([file.data]).size;
            }
          } catch (error) {
            console.warn(`Failed to get file size for ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.warn("Failed to calculate RemoteStorage usage:", error);
      }
    }
  } catch (error) {
    console.error("Error calculating storage usage:", error);
  }

  return { size, files };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function calculateArticleStorageSize(articleSlug: string): Promise<{
  totalSize: number;
  files: { path: string; size: number }[];
}> {
  let totalSize = 0;
  const files: { path: string; size: number }[] = [];

  try {
    console.log("calculateArticleStorageSize: Starting for slug:", articleSlug);
    const store = await init();
    if (store && store.client) {
      try {
        // Get all files for this specific article
        const pattern = `saves/${articleSlug}/*`;
        console.log("calculateArticleStorageSize: Using glob pattern:", pattern);
        const articleFiles = await glob(store.client, pattern);
        console.log("calculateArticleStorageSize: Got article files:", articleFiles);

        for (const filePath of articleFiles) {
          try {
            const file = (await store.client.getFile(filePath, false)) as { data: string };
            if (file && file.data) {
              const fileSize = new Blob([file.data]).size;
              files.push({ path: filePath, size: fileSize });
              totalSize += fileSize;
              console.log(
                "calculateArticleStorageSize: Processed file",
                filePath,
                "size:",
                fileSize
              );
            }
          } catch (error) {
            console.warn(
              `calculateArticleStorageSize: Failed to get file size for ${filePath}:`,
              error
            );
          }
        }

        console.log("calculateArticleStorageSize: Final result", {
          slug: articleSlug,
          totalSize,
          fileCount: files.length,
          files: files.map((f) => ({ path: f.path, size: f.size })),
        });
      } catch (error) {
        console.warn(
          "calculateArticleStorageSize: Failed to calculate article storage usage:",
          error
        );
      }
    } else {
      console.warn("calculateArticleStorageSize: No store or client available");
    }
  } catch (error) {
    console.error("calculateArticleStorageSize: Error calculating article storage size:", error);
  }

  return { totalSize, files };
}

async function deleteArticleStorage(articleSlug: string): Promise<{
  success: boolean;
  deletedFiles: string[];
  errors: string[];
}> {
  const deletedFiles: string[] = [];
  const errors: string[] = [];

  try {
    // Delete from IndexedDB database
    try {
      await db.articles.where("slug").equals(articleSlug).delete();
      console.log(`Deleted article ${articleSlug} from IndexedDB`);
    } catch (error) {
      errors.push(`Failed to delete from IndexedDB: ${error}`);
      console.error(`Failed to delete article ${articleSlug} from IndexedDB:`, error);
    }

    // Delete from RemoteStorage
    const store = await init();
    if (store && store.client) {
      try {
        console.log(`🗂️ Starting recursive deletion of article directory: saves/${articleSlug}`);
        const result = await recursiveDeleteDirectory(store.client, `saves/${articleSlug}`);

        // Add the results to our tracking arrays
        deletedFiles.push(...result.deletedFiles);
        errors.push(...result.errors);

        // // Show confirmation of what was deleted
        // if (result.success) {
        //   console.log(`✅ Successfully deleted article directory: saves/${articleSlug}`);
        //   console.log(`   📁 Deleted ${result.deletedDirectories.length} directories`);
        //   console.log(`   📄 Deleted ${result.deletedFiles.length} files`);
        // } else {
        //   console.warn(`⚠️ Partial deletion of article directory: saves/${articleSlug}`);
        //   console.warn(`   📁 Deleted ${result.deletedDirectories.length} directories`);
        //   console.warn(`   📄 Deleted ${result.deletedFiles.length} files`);
        //   console.warn(`   ❌ ${result.errors.length} errors occurred`);
        // }
      } catch (error) {
        // errors.push(`Failed to access RemoteStorage: ${error}`);
        console.warn("Failed to delete from RemoteStorage:", error);
      }
    } else {
      errors.push("RemoteStorage not available");
    }
  } catch (error) {
    errors.push(`General error: ${error}`);
    console.error("Error deleting article storage:", error);
  }

  return {
    success: errors.length === 0,
    deletedFiles,
    errors,
  };
}

async function recursiveDeleteDirectory(
  client: BaseClient,
  directoryPath: string
): Promise<{
  success: boolean;
  deletedFiles: string[];
  deletedDirectories: string[];
  errors: string[];
}> {
  const deletedFiles: string[] = [];
  const deletedDirectories: string[] = [];
  const errors: string[] = [];

  try {
    console.log(`🔍 Scanning directory for deletion: ${directoryPath}`);
    // Ensure the path ends with a slash for directory operations
    const normalizedPath = directoryPath.endsWith("/") ? directoryPath : `${directoryPath}/`;

    // Get the listing of the directory
    const listing = await client.getListing(normalizedPath);

    // Process all items in the directory
    for (const [name, _isFolder] of Object.entries(listing as Record<string, boolean>)) {
      const fullPath = normalizedPath + name;

      if (name.endsWith("/")) {
        // This is a subdirectory - recursively delete it
        const result = await recursiveDeleteDirectory(client, fullPath);
        deletedFiles.push(...result.deletedFiles);
        deletedDirectories.push(...result.deletedDirectories);
        errors.push(...result.errors);
      } else {
        // This is a file - delete it
        try {
          await client.remove(fullPath).then(() => {
            deletedFiles.push(fullPath);
            console.log(`📄 Deleted file: ${fullPath}`);
          });
        } catch (error) {
          const errorMsg = `Failed to delete file ${fullPath}: ${error}`;
          errors.push(errorMsg);
          console.warn(errorMsg);
        }
      }
    }

    // After deleting all contents, delete the directory itself
    try {
      await client.remove(normalizedPath).then(() => {
        deletedDirectories.push(normalizedPath);
        console.log(`🗂️ Deleted directory: ${normalizedPath}`);
      });
    } catch (error) {
      const errorMsg = `Failed to delete directory ${normalizedPath}: ${error}`;
      errors.push(errorMsg);
      console.warn(errorMsg);
    }
  } catch (error) {
    const errorMsg = `Failed to access directory ${directoryPath}: ${error}`;
    errors.push(errorMsg);
    console.error(errorMsg);
  }

  return {
    success: errors.length === 0,
    deletedFiles,
    deletedDirectories,
    errors,
  };
}

async function deleteAllRemoteStorage(): Promise<{
  success: boolean;
  deletedFiles: string[];
  errors: string[];
}> {
  const deletedFiles: string[] = [];
  const errors: string[] = [];

  try {
    // Delete from RemoteStorage
    const store = await init();
    if (store && store.client) {
      try {
        // Delete all articles from the saves/ directory
        const result = await recursiveDeleteDirectory(store.client, "saves/");
        deletedFiles.push(...result.deletedFiles);
        // Don't push errors from recursive delete as they're often benign (non-existing paths)
        console.log(`✅ Deleted ${result.deletedFiles.length} files from RemoteStorage`);
      } catch (error) {
        // Only log a warning - this is not critical
        console.warn("Error deleting from RemoteStorage:", error);
      }
    } else {
      errors.push("RemoteStorage not available");
    }
  } catch (error) {
    errors.push(`General error: ${error}`);
    console.error("Error deleting all remote storage:", error);
  }

  console.log("deleting left over items in indexeddb");

  // TODO: remove this hack once I figure out why deleting everything from remote storage is not sufficient

  // Delete all data from IndexedDB
  const _databases = await window.indexedDB.databases();
  // for (const db of databases) {
  //   if (db.name) {
  //     console.log("deleting database", db.name);
  //     try {
  //       await new Promise<void>((resolve, reject) => {
  //         const request = window.indexedDB.deleteDatabase(db.name!);
  //         request.onsuccess = () => {
  //           console.log(`Deleted IndexedDB database: ${db.name}`);
  //           resolve();
  //         };
  //         request.onerror = () => {
  //           const error = `Failed to delete IndexedDB database ${db.name}`;
  //           errors.push(error);
  //           console.warn(error);
  //           reject(new Error(error));
  //         };
  //       });
  //     } catch (error) {
  //       errors.push(`Error deleting database ${db.name}: ${error}`);
  //       console.error(`Error deleting database ${db.name}:`, error);
  //     }
  //   }
  // }

  console.log("deleteAllRemoteStorage done");

  return {
    success: errors.length === 0,
    deletedFiles,
    errors,
  };
}

/**
 * Reset sync state and replace local articles with server data.
 * Use this when you want to discard local articles and sync fresh from the server.
 *
 * This function:
 * 1. Clears all local articles from IndexedDB
 * 2. Resets the sync initialized flag
 * 3. Triggers a fresh sync from the server
 *
 * @returns A promise that resolves when the reset is complete
 */
async function resetSyncStateAndReplaceWithServer(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    console.info("🔄 Resetting sync state and replacing local data with server data...");

    // Clear all local articles
    const articleCount = await db.articles.count();
    await db.articles.clear();
    console.info(`   ✅ Cleared ${articleCount} local articles`);

    // Trigger a fresh sync
    const store = await init();
    if (store && store.remoteStorage) {
      await store.remoteStorage.startSync();
      console.info("   ✅ Triggered fresh sync from server");
    }

    return {
      success: true,
      message: `Cleared ${articleCount} local articles and triggered fresh sync from server`,
    };
  } catch (error) {
    console.error("Failed to reset sync state:", error);
    return {
      success: false,
      message: `Failed to reset sync state: ${error}`,
    };
  }
}

export {
  init,
  glob,
  calculateTotalStorage as calculateStorageUsage,
  calculateArticleStorageSize,
  deleteArticleStorage,
  deleteAllRemoteStorage,
  recursiveDeleteDirectory,
  formatBytes,
  resetSyncStateAndReplaceWithServer,
};
