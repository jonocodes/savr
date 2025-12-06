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

async function buildDbFromFiles(client: BaseClient) {
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
  }

  const articles: Article[] = [];
  for (const path of matches) {
    console.log(`📖 Processing: ${path}`);

    try {
      const file = (await client.getFile(path)) as { data: string };

      // If file.data is already an object, use it directly as the article
      if (typeof file.data === "object") {
        // for some reason this only happens with dropbox storage?
        articles.push(file.data as Article);
        console.log(`  ✓ Loaded article (object format): ${(file.data as Article).slug}`);
      } else {
        const article: Article = JSON.parse(file.data);
        articles.push(article);
        console.log(`  ✓ Loaded article (JSON format): ${article.slug}`);
      }
    } catch (error) {
      console.error(`  ✗ Error parsing article from ${path}:`, error);
    }
  }

  // Insert articles into IndexedDB
  if (articles.length > 0) {
    console.log(`💾 Inserting ${articles.length} articles into IndexedDB...`);

    // Insert articles one at a time to ensure proper change detection
    for (const article of articles) {
      try {
        await db.articles.put(article);
        console.log(`  ✓ Inserted: ${article.slug}`);
      } catch (error) {
        console.error(`  ✗ Failed to insert article ${article.slug}:`, error);
      }
    }
    console.log(`✅ Successfully inserted ${articles.length} articles`);
  } else {
    console.warn("⚠️ No articles to insert - clearing database");
    await db.articles.clear();
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
      // Don't rebuild here - wait for sync-done to ensure cache is populated
    });

    // This event fires after the initial sync completes and files are cached locally
    remoteStorage.on("sync-done", async () => {
      console.info("RemoteStorage sync-done - rebuilding database from synced files");
      await buildDbFromFiles(client);
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
      console.info("remoteStorage disconnected", arguments);
      await buildDbFromFiles(client);
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

    // Listen for change events from RemoteStorage sync
    // This handles when files are added/modified/deleted on the server by other clients
    let rebuildTimeout: NodeJS.Timeout | null = null;
    client.on("change", async (event: any) => {
      console.log("RemoteStorage change event:", event);

      // If a file in the saves/ directory changed, rebuild the database
      if (event.path && event.path.startsWith("saves/")) {
        console.log("Article changed on server, scheduling database rebuild...");

        // Debounce rebuilds - wait 500ms after the last change before rebuilding
        // This prevents rebuilding multiple times when many files change at once
        if (rebuildTimeout) {
          clearTimeout(rebuildTimeout);
        }

        rebuildTimeout = setTimeout(async () => {
          console.log("Rebuilding database after remote changes...");
          await buildDbFromFiles(client);
          rebuildTimeout = null;
        }, 500);
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
