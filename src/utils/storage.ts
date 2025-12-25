import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../lib/src/models";
// import extensionConnector from "./extensionConnector";
import { environmentConfig } from "~/config/environment";
import { DefaultGlobalNotFound } from "@tanstack/react-router";

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
      // for some reason this only happens with dropbox storage?
      article = file.data as Article;
      console.log(`  ✓ Loaded article (object format): ${article.slug}`);
    } else {
      article = JSON.parse(file.data);
      console.log(`  ✓ Loaded article (JSON format): ${article.slug}`);
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

  // Process and insert articles incrementally as they're found
  console.log(`💾 Processing ${matches.length} articles incrementally...`);
  for (const path of matches) {
    // Skip if already processed (when called from change handler)
    if (processedSet && processedSet.has(path)) {
      continue;
    }
    await processArticleFile(client, path);
    if (processedSet) {
      processedSet.add(path);
    }
  }

  console.log("🏁 Database refresh complete");
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

    remoteStorage.on("ready", function () {
      console.info("remoteStorage ready");
      resolve(remoteStorage);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`remoteStorage connected to "${userAddress}"`);
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

      // Get current article count before processing
      const articlesBefore = await db.articles.count();
      console.log(`📊 Articles in database before buildDbFromFiles: ${articlesBefore}`);

      await buildDbFromFiles(client, processedArticles);

      // Get article count after processing
      const articlesAfter = await db.articles.count();
      console.log(`📊 Articles in database after buildDbFromFiles: ${articlesAfter}`);

      // Force a database query to ensure useLiveQuery detects the changes
      // This helps trigger React re-renders if useLiveQuery didn't detect the changes
      if (articlesAfter > articlesBefore) {
        console.log(`✅ Added ${articlesAfter - articlesBefore} new articles - triggering refresh`);
        // Force a query to ensure the database transaction is complete
        await db.articles.toArray();
      }
    });

    // Also listen for when ongoing sync cycles complete
    remoteStorage.on("sync-req-done", async () => {
      console.info("RemoteStorage sync-req-done - sync cycle completed");
      // Note: We rely on the "change" event handler below to trigger rebuilds
      // for individual file changes, so we don't rebuild here to avoid duplicates
    });

    remoteStorage.on("not-connected", function () {
      console.info("remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", async function () {
      console.info("remoteStorage disconnected");

      // NOTE: We DON'T clear local articles on disconnect because:
      // 1. Users may want to keep reading cached articles while disconnected
      // 2. Clearing the database triggers RemoteStorage sync which can delete
      //    articles from the server before disconnect completes
      // 3. Articles will be cleared/refreshed on next connection anyway

      // Just clear the processed articles tracking
      processedArticles.clear();
      console.info("✅ Cleared processed articles tracking");
    });

    let lastNotificationTime = 0;
    let lastSyncErrTime = 0;
    const INITIAL_NOTIFICATION_TIMEOUT = 60_000;
    let notificationTimeout = INITIAL_NOTIFICATION_TIMEOUT;
    const TEN_MINUTES = 10 * 60 * 1000;

    remoteStorage.on("error", function (err) {
      console.error(`unforeseen remoteStorage error:`, err);

      //   if ('Unauthorized' === err?.name) { return; }
      //   if ("SyncError" === err?.name) {
      //     const timeDiff = Date.now() - lastNotificationTime + 8000;
      //     if (timeDiff > notificationTimeout) {
      //       transientMsg(extractUserMessage(err), 'warning');
      //       lastNotificationTime = Date.now();

      //       if (Date.now() - lastSyncErrTime > TEN_MINUTES) {
      //         notificationTimeout = INITIAL_NOTIFICATION_TIMEOUT;
      //       } else {
      //         notificationTimeout = Math.min(notificationTimeout * 2, TEN_MINUTES);
      //       }
      //     }
      //     lastSyncErrTime = Date.now();
      //   } else {
      //     console.error(`unforeseen remoteStorage error:`, err);
      //     transientMsg(extractUserMessage(err));
      //   }
    });

    remoteStorage.on("network-offline", () => {
      console.debug(`remoteStorage offline now.`);
    });

    remoteStorage.on("network-online", () => {
      console.debug(`remoteStorage back online.`);
    });

    // Track which articles we've already processed to avoid duplicates
    // This is shared between the change handler and sync-done handler
    const processedArticles = new Set<string>();

    // Listen for change events from RemoteStorage sync
    // This handles when files are added/modified/deleted on the server by other clients
    // Process articles incrementally as they're synced
    client.on("change", async (event: any) => {
      console.log("RemoteStorage change event:", event);

      // Check for both relative (saves/) and absolute (/savr/saves/) paths
      const path = event.path || event.relativePath || "";
      const isArticleFile = path.endsWith("/article.json");
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
          console.log(`Skipping already processed article: ${normalizedPath}`);
          return;
        }

        // Only process if this is a new file (newValue exists, oldValue doesn't)
        // or if it's an update (both exist)
        if (event.newValue !== undefined) {
          console.log(`📥 New/updated article detected: ${normalizedPath}`);
          processedArticles.add(normalizedPath);

          try {
            // Process immediately - no debouncing for individual files
            await processArticleFile(client, normalizedPath);
            // Force a query to ensure useLiveQuery detects the change
            await db.articles.toArray();
          } catch (error) {
            console.error(
              `  ✗ Failed to process article from change event: ${normalizedPath}`,
              error
            );
            // Remove from processed set so it can be retried by buildDbFromFiles
            processedArticles.delete(normalizedPath);
          }
        } else if (event.oldValue !== undefined && event.newValue === undefined) {
          // File was deleted
          console.log(`🗑️ Article deleted: ${normalizedPath}`);
          processedArticles.delete(normalizedPath);

          // Extract slug from path and delete from IndexedDB
          const slugMatch = normalizedPath.match(/saves\/([^\/]+)\/article\.json/);
          if (slugMatch) {
            const slug = slugMatch[1];
            try {
              await db.articles.delete(slug);
              console.log(`  ✅ Deleted article from IndexedDB: ${slug}`);
              // Force a query to ensure useLiveQuery detects the change
              await db.articles.toArray();
            } catch (error) {
              console.error(`  ✗ Failed to delete article ${slug}:`, error);
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

        // Calculate size of files in RemoteStorage
        for (const filePath of allFiles) {
          try {
            const file = (await store.client.getFile(filePath)) as { data: string };
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
            const file = (await store.client.getFile(filePath)) as { data: string };
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
