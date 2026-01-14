import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../lib/src/models";
// import extensionConnector from "./extensionConnector";
import { environmentConfig } from "~/config/environment";
import { DefaultGlobalNotFound } from "@tanstack/react-router";

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
    for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
      // console.log("recursiveList: Processing item", { name, isFolder, path: safePath });
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
    debugger;
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
    debugger;
    return [];
  }
}

// Process a single article.json file and insert it into IndexedDB immediately
async function processArticleFile(client: BaseClient, filePath: string): Promise<void> {
  try {
    console.log(`📖 Processing article file: ${filePath}`);
    const file = (await client.getFile(filePath)) as { data: string };

    let article: Article;
    if (typeof file.data === "object") {
      // for some reason this only happens with dropbox storage?
      article = file.data as Article;
      console.log(`  ✓ Loaded article (object format): ${article.slug}`);
    } else {
      article = JSON.parse(file.data);
      console.log(`  ✓ Loaded article (JSON format): ${article.slug}`);
    }

    // Insert immediately into IndexedDB
    await db.articles.put(article);
    console.log(`  ✅ Inserted: ${article.slug}`);
  } catch (error) {
    console.error(`  ✗ Error processing article file ${filePath}:`, error);
  }
}

async function buildDbFromFiles(client: BaseClient, processedSet?: Set<string>) {
  console.log("🔄 Refreshing database from remote storage files");

  // Check cache status by looking at root listing
  try {
    const rootListing = await client.getListing("");
    console.log("📂 Root listing:", rootListing);
  } catch (error) {
    console.warn("⚠️ Failed to get root listing - cache may not be ready:", error);
  }

  const matches = await glob(client, "saves/*/article.json");

  console.log(`📄 Matched ${matches.length} article files:`, matches);

  if (matches.length === 0) {
    console.warn("⚠️ No article.json files found. This could mean:");
    console.warn("  1. Remote storage is empty");
    console.warn("  2. Cache is not ready yet (sync still in progress)");
    console.warn("  3. Files exist but glob pattern didn't match");
    return;
  }

  // Filter out already processed articles
  const articlesToProcess = matches.filter(path => !processedSet || !processedSet.has(path));

  if (articlesToProcess.length === 0) {
    console.log("✓ All articles already processed, skipping");
    return;
  }

  // Notify that sync is starting
  notifySyncProgress({
    isSyncing: true,
    totalArticles: articlesToProcess.length,
    processedArticles: 0,
  });

  // Fetch articles with their ingestDate for sorting
  console.log(`📥 Fetching ${articlesToProcess.length} articles for sorting...`);
  const articlesWithDates: Array<{ path: string; article: Article; ingestDateMs: number }> = [];

  for (const path of articlesToProcess) {
    try {
      const file = (await client.getFile(path)) as { data: string };
      let article: Article;
      if (typeof file.data === "object") {
        article = file.data as Article;
      } else {
        article = JSON.parse(file.data);
      }
      // Convert ingestDate string to milliseconds timestamp for sorting
      const ingestDateMs = article.ingestDate ? new Date(article.ingestDate).getTime() : 0;
      articlesWithDates.push({
        path,
        article,
        ingestDateMs,
      });
    } catch (error) {
      console.error(`  ✗ Error fetching article file ${path} for sorting:`, error);
    }
  }

  // Sort by archive status first (non-archived first), then by ingestDate descending (newest first)
  articlesWithDates.sort((a, b) => {
    // Prioritize non-archived articles
    const aIsArchived = a.article.state === "archived" ? 1 : 0;
    const bIsArchived = b.article.state === "archived" ? 1 : 0;

    if (aIsArchived !== bIsArchived) {
      return aIsArchived - bIsArchived; // Non-archived (0) comes before archived (1)
    }

    // Within same archive status, sort by newest first
    return b.ingestDateMs - a.ingestDateMs;
  });
  console.log(`📊 Sorted ${articlesWithDates.length} articles (non-archived first, then by newest)`);

  // Process and insert articles in sorted order (non-archived first, then newest)
  console.log(`💾 Processing ${articlesWithDates.length} articles (non-archived first, then newest)...`);
  let processedCount = 0;
  for (const { path, article } of articlesWithDates) {
    try {
      console.log(`📖 Processing article: ${article.slug} (${new Date(article.ingestDate).toISOString()})`);
      await db.articles.put(article);
      console.log(`  ✅ Inserted: ${article.slug}`);
      if (processedSet) {
        processedSet.add(path);
      }
      processedCount++;
      // Update progress
      notifySyncProgress({
        processedArticles: processedCount,
      });
    } catch (error) {
      console.error(`  ✗ Error inserting article ${article.slug}:`, error);
    }
  }

  console.log("🏁 Database refresh complete");

  // Mark sync as complete
  notifySyncProgress({
    isSyncing: false,
    phase: "idle",
  });
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

    remoteStorage.on("ready", function () {
      console.info("🔵 remoteStorage ready");
      resolve(remoteStorage);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`🟢 remoteStorage connected to "${userAddress}"`);
      isSyncing = true;
      // Notify UI that sync is starting
      notifySyncProgress({
        phase: hasCompletedInitialSync ? "ongoing" : "initial",
        isSyncing: true,
      });
      // Sync is automatically triggered on connection, but we can ensure it happens
      // The sync-done event will fire when sync completes
    });

    // This event fires after the initial sync completes and files are cached locally
    // We still run buildDbFromFiles here to catch any files that might have been missed
    // by the incremental change handler, but most articles should already be loaded
    remoteStorage.on("sync-done", async () => {
      console.info("RemoteStorage sync-done - checking for any missed files");
      // Wait a bit longer to ensure cache is fully populated and change events have fired
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if sync is actually complete by verifying cache status
      let retries = 0;
      const maxRetries = 5;
      while (retries < maxRetries) {
        try {
          const listing = await client.getListing("saves/");
          if (listing !== undefined) {
            // Cache appears ready, proceed with buildDbFromFiles
            break;
          }
        } catch (error) {
          console.warn(`⚠️ Cache check failed (attempt ${retries + 1}/${maxRetries}):`, error);
        }
        retries++;
        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      await buildDbFromFiles(client, processedArticles);
      isSyncing = false;
      hasCompletedInitialSync = true;
      console.info("✅ Initial sync complete - database ready");
    });

    // Also listen for when ongoing sync cycles complete
    remoteStorage.on("sync-req-done", async () => {
      console.info("🔄 RemoteStorage sync-req-done - sync cycle completed");
      // Mark sync as complete if we were syncing (for ongoing syncs after initial)
      if (isSyncing && hasCompletedInitialSync) {
        isSyncing = false;
        console.info("   ✅ Ongoing sync complete");
      }
      // Note: We rely on the "change" event handler to process individual file changes
      // incrementally, so we don't rebuild the entire database here
    });

    remoteStorage.on("not-connected", function () {
      console.info("⚪ remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", async function () {
      const articleCount = await db.articles.count();
      console.warn(`🔴 remoteStorage disconnected - ${articleCount} articles in local database`);
      console.warn(`   isSyncing: ${isSyncing}, hasCompletedInitialSync: ${hasCompletedInitialSync}`);

      // IMPORTANT: Only clear database if this is a deliberate user disconnect
      // Do NOT clear during sync operations or reconnect cycles
      if (!isSyncing && hasCompletedInitialSync) {
        console.info("   → User-initiated disconnect detected, clearing local articles");
        try {
          await db.articles.clear();
          processedArticles.clear(); // Clear processed articles tracking
          hasCompletedInitialSync = false;
          console.info("   ✅ Cleared all articles from local database");
        } catch (error) {
          console.error("   ❌ Failed to clear articles from local database:", error);
        }
      } else {
        console.info("   → Preserving local database during sync/reconnect cycle");
      }
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
    });

    remoteStorage.on("network-online", () => {
      console.info(`📶 remoteStorage network online - sync will resume`);
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

    // Listen for change events from RemoteStorage sync
    // This handles when files are added/modified/deleted on the server by other clients
    // Process articles incrementally as they're synced
    client.on("change", async (event: any) => {
      const path = event.path || event.relativePath || "";
      const isArticleFile = path.endsWith("/article.json");

      // Only log article-related changes to reduce noise
      if (isArticleFile) {
        console.log("🔄 RemoteStorage change event:", {
          path,
          origin: event.origin,
          hasOldValue: event.oldValue !== undefined,
          hasNewValue: event.newValue !== undefined
        });
      }

      // Check for both relative (saves/) and absolute (/savr/saves/) paths
      const isArticleChange =
        (path.startsWith("saves/") ||
          path.startsWith("/savr/saves/") ||
          path.includes("/saves/")) &&
        isArticleFile;

      if (isArticleChange) {
        // Normalize path to relative format for tracking
        const normalizedPath = path.startsWith("/savr/") ? path.slice(6) : path;

        // Skip if we've already processed this file
        if (processedArticles.has(normalizedPath)) {
          console.log(`   ⏭️  Already processed: ${normalizedPath}`);
          return;
        }

        // Only process if this is a new file (newValue exists, oldValue doesn't)
        // or if it's an update (both exist)
        if (event.newValue !== undefined) {
          console.log(`   📥 Processing new/updated article: ${normalizedPath}`);
          processedArticles.add(normalizedPath);

          // Process immediately - no debouncing for individual files
          try {
            await processArticleFile(client, normalizedPath);
          } catch (error) {
            console.error(`   ❌ Failed to process article file:`, error);
            // Remove from processed set so it can be retried
            processedArticles.delete(normalizedPath);
          }
        } else if (event.oldValue !== undefined && event.newValue === undefined) {
          // File was deleted
          console.log(`   🗑️  Article deleted: ${normalizedPath}`);
          processedArticles.delete(normalizedPath);

          // Extract slug from path and delete from IndexedDB
          const slugMatch = normalizedPath.match(/saves\/([^\/]+)\/article\.json/);
          if (slugMatch) {
            const slug = slugMatch[1];
            try {
              await db.articles.delete(slug);
              console.log(`      ✅ Removed from IndexedDB: ${slug}`);
            } catch (error) {
              console.error(`      ❌ Failed to delete article ${slug}:`, error);
            }
          }
        }
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
    for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
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
        await recursiveDeleteDirectory(store.client, "");
      } catch (error) {
        errors.push(`Failed to access RemoteStorage: ${error}`);
        console.warn("Failed to delete from RemoteStorage:", error);
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
  const databases = await window.indexedDB.databases();
  for (const db of databases) {
    if (db.name) {
      try {
        await new Promise<void>((resolve, reject) => {
          const request = window.indexedDB.deleteDatabase(db.name!);
          request.onsuccess = () => {
            console.log(`Deleted IndexedDB database: ${db.name}`);
            resolve();
          };
          request.onerror = () => {
            const error = `Failed to delete IndexedDB database ${db.name}`;
            errors.push(error);
            console.warn(error);
            reject(new Error(error));
          };
        });
      } catch (error) {
        errors.push(`Error deleting database ${db.name}: ${error}`);
        console.error(`Error deleting database ${db.name}:`, error);
      }
    }
  }

  return {
    success: errors.length === 0,
    deletedFiles,
    errors,
  };
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
};
