import type RemoteStorage from "remotestoragejs";

/**
 * Stop remotestoragejs from wiping its local IndexedDB cache on disconnect.
 *
 * Default behavior: `RemoteStorage#disconnect()` runs the IndexedDB feature's
 * `_rs_cleanup`, which calls `indexedDB.deleteDatabase("remotestorage")` and
 * deletes every file the app has stored via `client.storeFile()` (article HTML,
 * PDFs, images, thumbnails). Our Dexie `db.articles` (metadata only) survives,
 * so the article list keeps rendering rows while every content lookup returns
 * nothing and the UI shows "(content missing)" on every row.
 *
 * Upstream issue: https://github.com/remotestorage/remotestorage.js/issues/1170
 *
 * This patch overwrites that feature cleanup with one that only closes the DB
 * handle, leaving cached files intact.
 *
 * Caveat: a user disconnecting and reconnecting under a DIFFERENT userAddress
 * will see the previous user's cached content until a fresh sync overwrites it.
 * Acceptable for Savr (single user per browser); revisit if multi-account is
 * ever added.
 *
 * Must run AFTER `new RemoteStorage(...)` (so `featureModules` is populated)
 * and BEFORE any `disconnect()` (so the patched cleanup is the one captured
 * by `featureInitialized` when the IndexedDB feature's init promise resolves).
 */
export function patchDisconnectKeepsLocalCache(rs: RemoteStorage): void {
  const fm = (rs as unknown as {
    featureModules?: Record<string, { _rs_cleanup?: (rs: unknown) => Promise<unknown> }>;
  }).featureModules;

  const idb = fm?.IndexedDB;
  if (!idb || typeof idb._rs_cleanup !== "function") {
    console.warn(
      "[rsPatch] IndexedDB feature module not found on RemoteStorage instance; " +
        "skipping disconnect-cache patch. Disconnect will still wipe cached files."
    );
    return;
  }

  idb._rs_cleanup = function keepLocalCacheOnDisconnect(rsInstance: unknown) {
    return new Promise<void>((resolve) => {
      const local = (rsInstance as { local?: { closeDB?: () => void } }).local;
      if (local && typeof local.closeDB === "function") {
        local.closeDB();
      }
      resolve();
    });
  };
}
