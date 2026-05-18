import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../lib/src/models";
// import extensionConnector from "./extensionConnector";
import { environmentConfig } from "~/config/environment";
import { parseListing, reconcile, opFromChange, type Op } from "./reconciler";

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
  emitDiagnostic("progress", {
    isSyncing: currentSyncProgress.isSyncing,
    phase: currentSyncProgress.phase,
    processed: currentSyncProgress.processedArticles,
    total: currentSyncProgress.totalArticles,
  });
}

// Diagnostic event channel — for surfacing internal sync activity on the diagnostics page.
export interface DiagnosticEvent {
  category: string;
  data?: Record<string, unknown>;
}

type DiagnosticListener = (event: DiagnosticEvent) => void;
let diagnosticListeners: DiagnosticListener[] = [];

export function subscribeDiagnostic(listener: DiagnosticListener): () => void {
  diagnosticListeners.push(listener);
  return () => {
    diagnosticListeners = diagnosticListeners.filter((l) => l !== listener);
  };
}

function emitDiagnostic(category: string, data?: Record<string, unknown>) {
  const event = { category, data, ts: Date.now() };
  diagnosticListeners.forEach((listener) => listener(event));
  // Expose to Playwright / devtools: window.__savrDiag is a ring buffer of the last 2000 events
  const w = window as unknown as { __savrDiag?: typeof event[] };
  if (!w.__savrDiag) w.__savrDiag = [];
  w.__savrDiag.push(event);
  if (w.__savrDiag.length > 2000) w.__savrDiag.shift();
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

let remotePrms: Promise<RemoteStorage> | undefined;

// Exposed so syncMissingArticles() can trigger a reconcile on demand
let triggerReconcile: (() => Promise<void>) | null = null;

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
  retryCount = 0,
  source: string = "change-event"
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
        return processArticleFile(client, filePath, retryCount + 1, source);
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
    emitDiagnostic("db-put", { slug: article.slug, source });
    console.log(`  ✅ Inserted: ${article.slug}`);
  } catch (error) {
    // If it's a parsing error and we haven't retried, try again (file might be partially cached)
    if (retryCount < maxRetries && error instanceof SyntaxError) {
      console.log(
        `  ⏳ JSON parse error, file might be partially cached, retrying in ${retryDelay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return processArticleFile(client, filePath, retryCount + 1, source);
    }
    console.error(`  ✗ Error processing article file ${filePath}:`, error);
    // Re-throw to allow callers to handle the error
    throw error;
  }
}



function initRemote() {
  remotePrms = new Promise<RemoteStorage>((resolve) => {
    const remoteStorage = new RemoteStorage({
      logging: false,
      // Disable local (fireInitial) change events. By default RS fires a change event
      // for every locally-cached file on every `ready` event so the app can hydrate
      // itself from RS's cache. We use Dexie + useLiveQuery instead, so these are pure
      // noise. More importantly, fireInitial perturbs the listing cache in a way that can
      // make getListing("saves/") return stale data when reconcile runs right after sync-done,
      // causing spurious 1-op cycles on every reload. Remote and conflict events are kept.
      changeEvents: { local: false, window: false, remote: true, conflict: true },
    });
    remoteStorage.setApiKeys({
      googledrive: environmentConfig.apiKeys.googleDrive,
      dropbox: environmentConfig.apiKeys.dropbox,
    });
    remoteStorage.access.claim("savr", "rw");

    const client = remoteStorage.scope("/savr/");
    remoteStorage.caching.enable("/savr/");

    let isSyncing = false;
    let hasEverSynced = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    // Tracks whether we've run the first reconcile after an RS connection.
    // Reconcile is deferred to after the first sync-done event (not immediately on
    // "connected") so that getListing() reads from a fresh server snapshot, not an
    // empty/stale local cache. Without this guard reconcile can delete locally-written
    // articles (e.g. from the bookmarklet flow) whose uploads haven't reached the server yet.
    let hasTriggeredInitialReconcile = false;

    // Apply a single reconciler Op (progress is tracked by the caller).
    async function applyOp(op: Op): Promise<void> {
      if (op.type === "fetch") {
        await processArticleFile(client, `saves/${op.slug}/article.json`, 0, "reconcile");
      } else {
        // Before deleting, verify the article isn't in RS's local cache (which includes
        // dirty/pending uploads). getListing() only reflects the SERVER state, so an article
        // queued for upload via storeFile() (e.g. from the bookmarklet flow) would appear as
        // "local but not remote" and be wrongly deleted. Pass maxAge:false to read ONLY from
        // the local cache (no server check) — otherwise getFile falls through to a server
        // GET which 404s for files that haven't been uploaded yet, defeating the guard.
        const cached = await client.getFile(`saves/${op.slug}/article.json`, false) as { data?: unknown } | null;
        if (cached && cached.data) {
          return;
        }
        await db.articles.delete(op.slug);
        emitDiagnostic("db-delete", { slug: op.slug, source: "reconcile" });
      }
    }

    // Diff local vs remote and apply all ops.
    // Ops are run with up to CONCURRENCY parallel workers so a cold RS cache
    // (many sequential IDB reads) doesn't serialize the whole initial sync.
    const RECONCILE_CONCURRENCY = 10;

    async function runReconcile(): Promise<void> {
      if (isSyncing) return;
      // Skip if RS isn't connected — getListing would return an empty/stale listing
      // and the reconcile would falsely delete local articles. This matters for the
      // bookmarklet flow which writes locally before any RS connection.
      if (!remoteStorage.remote.connected) return;
      isSyncing = true;
      let hadWork = false;
      try {
        const listing = (await client.getListing("saves/")) as Record<string, boolean>;
        const remoteSlugs = parseListing(listing);
        const localSlugs = (await db.articles.toArray()).map((a) => a.slug);
        const ops = reconcile(localSlugs, remoteSlugs);

        // Nothing to do — clear the "connected" spinner and bail.
        if (ops.length === 0) {
          hasEverSynced = true;
          notifySyncProgress({ isSyncing: false, phase: "idle" });
          return;
        }

        hadWork = true;
        let completed = 0;
        notifySyncProgress({
          isSyncing: true,
          phase: localSlugs.length === 0 ? "initial" : "ongoing",
          totalArticles: ops.length,
          processedArticles: 0,
        });

        const queue = [...ops];
        async function worker(): Promise<void> {
          let op: Op | undefined;
          while ((op = queue.shift()) !== undefined) {
            try {
              await applyOp(op);
            } catch (opErr) {
              console.error(`applyOp failed for ${op.slug}:`, opErr);
            }
            notifySyncProgress({ processedArticles: ++completed });
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(RECONCILE_CONCURRENCY, ops.length) }, worker)
        );

        hasEverSynced = true;
      } catch (err) {
        console.error("runReconcile error:", err);
      } finally {
        isSyncing = false;
        if (hadWork) {
          const finalCount = await db.articles.count();
          notifySyncProgress({
            isSyncing: false,
            phase: "idle",
            totalArticles: finalCount,
            processedArticles: finalCount,
          });
        }
      }
    }

    // Expose so syncMissingArticles() can trigger on demand
    triggerReconcile = runReconcile;

    // Collapses rapid-fire events into a single reconcile run
    function scheduleReconcile(delayMs = 500): void {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        runReconcile();
      }, delayMs);
    }

    remoteStorage.on("ready", function () {
      console.info("🔵 remoteStorage ready");
      resolve(remoteStorage);
    });

    remoteStorage.on("connected", () => {
      console.info(`🟢 remoteStorage connected to "${remoteStorage.remote.userAddress}"`);
      notifySyncProgress({ isSyncing: true, phase: "ongoing", totalArticles: 0, processedArticles: 0 });
      hasTriggeredInitialReconcile = false;
      // Reconcile is intentionally NOT triggered here. Running it immediately on "connected"
      // is unsafe: RS's local listing cache hasn't been refreshed from the server yet, so
      // getListing() returns empty and reconcile would delete locally-written articles (e.g.
      // from the bookmarklet flow) that haven't been pushed to the server yet.
      // Instead, reconcile is deferred to after the first sync-done event below.
    });

    // sync-done fires after every RS sync cycle, including ones triggered by our own
    // getListing() call inside runReconcile. Scheduling a reconcile on EVERY sync-done
    // creates a self-reinforcing loop: reconcile → getListing → sync-done → reconcile → ...
    // We guard against this with hasTriggeredInitialReconcile: we run reconcile exactly once
    // after the first sync-done per connection, when the cache is fresh from the server.
    // Change events + the 5s safety-net debounce in the change handler cover real-time
    // updates from other devices after that.
    remoteStorage.on("sync-done", () => {
      console.info("RemoteStorage sync-done");
      emitDiagnostic("handler", { name: "sync-done" });
      if (!hasTriggeredInitialReconcile) {
        hasTriggeredInitialReconcile = true;
        scheduleReconcile(0);
      }
    });

    // sync-req-done fires for every internal RS sub-request (~7x per article).
    // We no longer trigger a reconcile here — sync-done covers the full cycle.
    remoteStorage.on("sync-req-done", () => {
      console.debug("🔄 RemoteStorage sync-req-done");
      emitDiagnostic("handler", { name: "sync-req-done" });
    });

    remoteStorage.on("not-connected", function () {
      console.info("⚪ remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", async function () {
      const articleCount = await db.articles.count();
      console.warn(`🔴 remoteStorage disconnected - ${articleCount} articles preserved locally`);
      // Local articles are intentionally kept on disconnect. RS uses ETags for delta sync
      // on reconnect, so nothing re-downloads if the data hasn't changed remotely.
      // Users who want a clean slate can use the "delete all articles" button in Preferences.
      hasEverSynced = false;
      isSyncing = false;
      hasTriggeredInitialReconcile = false;
    });

    remoteStorage.on("error", function (err) {
      console.error("🚨 remoteStorage error:", err);
      if (isSyncing) isSyncing = false;
    });

    remoteStorage.on("network-offline", () => {
      console.info("📴 remoteStorage network offline");
    });

    remoteStorage.on("network-online", () => {
      console.info("📶 remoteStorage network online");
      if (hasEverSynced) scheduleReconcile();
    });

    remoteStorage.on("wire-busy", () => {
      console.debug("⚡ remoteStorage wire-busy");
    });

    remoteStorage.on("wire-done", () => {
      console.debug("⚡ remoteStorage wire-done");
    });

    // Change events: apply the specific op immediately for responsiveness, then schedule
    // a safety-net reconcile (5s debounce) to catch anything the stream missed.
    client.on("change", async (evt: unknown) => {
      const event = evt as { path?: string; relativePath?: string; oldValue?: unknown; newValue?: unknown; origin?: string };
      const rawPath = event.path || event.relativePath || "";
      const path = rawPath.startsWith("/savr/") ? rawPath.slice(6) : rawPath;

      emitDiagnostic("change", {
        path,
        hasNew: event.newValue !== undefined,
        hasOld: event.oldValue !== undefined,
      });

      const op = opFromChange(path, event.newValue !== undefined);
      if (!op) return;

      try {
        if (op.type === "fetch") {
          // If the article is already in Dexie and this looks like a first-time announcement
          // (hasOld=false), skip the immediate fetch — the reconcile will confirm it's current.
          if (event.oldValue === undefined && (await db.articles.get(op.slug))) return;

          // Prefer event.newValue over client.getFile() — RS fires change events before its
          // local cache is committed, so getFile() can return stale data (e.g. old "unread"
          // state when the server has "archived"). newValue is the ground-truth data direct
          // from the sync payload and is always current.
          const rawData = event.newValue;
          if (rawData !== undefined && rawData !== null) {
            try {
              const article = (typeof rawData === "string"
                ? JSON.parse(rawData)
                : rawData) as Article;
              if (article && article.slug) {
                await db.articles.put(article);
                emitDiagnostic("db-put", { slug: article.slug, source: "change-event" });
                console.log(`  ✅ Inserted: ${article.slug}`);
                scheduleReconcile(5000);
                return;
              }
            } catch {
              // newValue couldn't be used directly — fall through to getFile()
            }
          }

          await processArticleFile(client, `saves/${op.slug}/article.json`, 0, "change-event");
        } else {
          // origin "local" means we called client.remove() and already deleted from Dexie —
          // skip the redundant guard and the no-op delete.
          // For remote/window/conflict origins, a spurious delete can fire while a storeFile
          // upload is in flight (RS GET 404s the file before it reaches the server). We can't
          // use origin alone to distinguish that from a real remote delete, so we fall back to
          // the cache check: if the file is still in RS's local cache it's a pending upload,
          // not a real deletion.
          if (event.origin !== "local") {
            const cached = await client.getFile(`saves/${op.slug}/article.json`, false) as { data?: unknown } | null;
            if (cached && cached.data) return;
          }
          await db.articles.delete(op.slug);
          emitDiagnostic("db-delete", { slug: op.slug, source: "change-event" });
        }
      } catch (err) {
        console.error("change handler error:", err);
      }

      scheduleReconcile(5000);
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

// Manually trigger a full reconcile (for diagnostics button)
export async function syncMissingArticles(): Promise<string> {
  if (!triggerReconcile) return "Not connected to RemoteStorage";
  const before = await db.articles.count();
  await triggerReconcile();
  const after = await db.articles.count();
  const delta = after - before;
  if (delta === 0) return `No discrepancies found. ${after} articles in database.`;
  const added = Math.max(0, delta);
  const removed = Math.max(0, -delta);
  return `Reconciled: +${added} added, -${removed} removed. Now: ${after} articles.`;
}

async function calculateTotalStorage(): Promise<{
  size: number;
  articles: number;
  files: number;
}> {
  let size = 0;
  let articles = 0;
  let files = 0;

  try {
    const { db } = await import("./db");
    const allArticles = await db.articles.toArray();
    articles = allArticles.length;

    for (const article of allArticles) {
      if (article.sizeBytes != null && article.assetCount != null) {
        size += article.sizeBytes;
        files += article.assetCount;
      } else {
        // Backfill: compute size on the fly and persist it
        try {
          const sizeInfo = await calculateArticleStorageSize(article.slug);
          size += sizeInfo.totalSize;
          files += sizeInfo.files.length;
          if (sizeInfo.totalSize > 0) {
            await db.articles.update(article.slug, {
              sizeBytes: sizeInfo.totalSize,
              assetCount: sizeInfo.files.length,
            });
          }
        } catch (error) {
          console.warn(`Failed to backfill size for ${article.slug}:`, error);
        }
      }
    }
  } catch (error) {
    console.error("Error calculating storage usage:", error);
  }

  return { size, articles, files };
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
        // Get all files for this specific article (including subdirectories like resources/)
        const pattern = `saves/${articleSlug}/**/*`;
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
