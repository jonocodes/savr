import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../lib/src/models";
// import extensionConnector from "./extensionConnector";
import { environmentConfig } from "~/config/environment";

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
  const listing = await client.getListing(path);

  let files: string[] = [];
  for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
    // Type assertion here
    if (name.endsWith("/")) {
      // Recursively list subfolder
      const subFiles = await recursiveList(client, path + name);
      files = files.concat(subFiles);
    } else {
      files.push(path + name);
    }
  }
  return files;
}

async function glob(client: BaseClient, pattern: string, basePath = ""): Promise<string[]> {
  const allFiles = await recursiveList(client, basePath);
  return allFiles.filter((filePath: string) => minimatch(filePath, pattern));
}

function initRemote() {
  remotePrms = new Promise<RemoteStorage>((resolve) => {
    const remoteStorage = new RemoteStorage({
      logging: false,
      // cache: false
      //   modules: ["sync"],
    });
    remoteStorage.setApiKeys({
      // googledrive: environmentConfig.apiKeys.googleDrive,
      dropbox: environmentConfig.apiKeys.dropbox,
    });
    remoteStorage.access.claim("savr", "rw");

    const client = remoteStorage.scope("/savr/");

    remoteStorage.caching.enable("/savr/");

    remoteStorage.on("ready", function () {
      console.info("remoteStorage ready");
      resolve(remoteStorage);

      // Initialize the extension connector when remote storage is ready
      // if (typeof window !== "undefined") {
      //   window.extensionConnector = extensionConnector;
      //   console.log("SAVR PWA: ExtensionConnector initialized and available globally");
      // }

      //   remoteStorage.documents.subscribe(changeHandler);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`remoteStorage connected to “${userAddress}”`);

      // client.getListing("").then((listing) => console.log("listing", listing));

      console.log("creating db");

      // const files = await recursiveList(client, "");

      // console.log("files", files);

      const matches = await glob(client, "saves/*/article.json");

      console.log("Matched files:", matches);

      // Load all articles first, then batch insert them
      const articles: Article[] = [];
      for (const path of matches) {
        console.log(path);

        const file = (await client.getFile(path)) as { data: string }; // Type assertion here

        const article: Article = JSON.parse(file.data);
        articles.push(article);
      }

      // Batch insert all articles at once to minimize useLiveQuery triggers
      if (articles.length > 0) {
        await db.articles.bulkPut(articles);
        console.log(`Bulk inserted ${articles.length} articles`);
      }
    });

    remoteStorage.on("not-connected", function () {
      console.info("remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", function () {
      console.info("remoteStorage disconnected", arguments);
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
    const store = await init();
    if (store && store.client) {
      try {
        // Get all files for this specific article
        const articleFiles = await glob(store.client, `saves/${articleSlug}/*`);

        for (const filePath of articleFiles) {
          try {
            const file = (await store.client.getFile(filePath)) as { data: string };
            if (file && file.data) {
              const fileSize = new Blob([file.data]).size;
              files.push({ path: filePath, size: fileSize });
              totalSize += fileSize;
            }
          } catch (error) {
            console.warn(`Failed to get file size for ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.warn("Failed to calculate article storage usage:", error);
      }
    }
  } catch (error) {
    console.error("Error calculating article storage size:", error);
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
    // Delete from IndexedDB
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
        // // Get all files in RemoteStorage
        // const allFiles = await recursiveList(store.client, "");

        // for (const filePath of allFiles) {
        //   try {
        //     await store.client.remove(filePath);
        //     deletedFiles.push(filePath);
        //     console.log(`Deleted file: ${filePath}`);
        //   } catch (error) {
        //     errors.push(`Failed to delete ${filePath}: ${error}`);
        //     console.warn(`Failed to delete file ${filePath}:`, error);
        //   }
        // }

        // // Try to remove all directories
        // try {
        //   await store.client.remove("saves/");
        //   console.log(`Deleted saves directory`);
        // } catch (error) {
        //   console.warn(`Failed to delete saves directory:`, error);
        // }
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
