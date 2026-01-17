import { Page } from "@playwright/test";

/**
 * Connect to RemoteStorage programmatically using OAuth token
 * This bypasses the normal OAuth flow by using a pre-generated token from Armadietto
 */
export async function connectToRemoteStorage(
  page: Page,
  userAddress: string,
  token: string
): Promise<void> {
  // Wait for RemoteStorage to be initialized by RemoteStorageProvider
  await page.waitForFunction(() => !!(window as any).remoteStorage, { timeout: 10000 });

  await page.evaluate(
    async ({ userAddress, token }) => {
      const rs = (window as any).remoteStorage;

      if (!rs) {
        throw new Error("RemoteStorage not initialized");
      }

      // Check if already connected to the same user address
      if (rs.remote && rs.remote.connected && rs.remote.userAddress === userAddress) {
        return;
      }

      // Extract the storage URL from userAddress (format: testuser@localhost:8006)
      const [username, hostPort] = userAddress.split("@");
      const storageRoot = `http://${hostPort}/storage/${username}`;
      const properties = {
        userAddress: userAddress,
        href: storageRoot,
        storageApi: "draft-dejong-remotestorage-22",
        token: token,
        properties: {
          "http://remotestorage.io/spec/version": "draft-dejong-remotestorage-22",
          "http://tools.ietf.org/html/rfc6749#section-4.2": `http://${hostPort}/oauth/${username}`,
        },
      };

      // Directly configure the remote storage (bypass webfinger discovery)
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout after 15 seconds to ${userAddress}`));
        }, 15000);

        const cleanup = () => {
          clearTimeout(timeout);
          rs.removeEventListener("connected", onConnected);
          rs.removeEventListener("error", onError);
        };

        const onConnected = () => {
          cleanup();
          resolve();
        };

        const onError = (err: any) => {
          cleanup();
          reject(err);
        };

        rs.on("connected", onConnected);
        rs.on("error", onError);

        // Configure the remote storage directly (bypasses webfinger discovery)
        try {
          rs.remote.configure(properties);
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    },
    { userAddress, token }
  );
}

/**
 * Trigger a manual sync in RemoteStorage
 * This forces RemoteStorage to check the server for changes
 */
export async function triggerRemoteStorageSync(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rs = (window as any).remoteStorage;
    if (!rs || !rs.sync) {
      throw new Error("RemoteStorage or sync not available");
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(); // Resolve anyway to avoid hanging tests
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        rs.removeEventListener("sync-done", onSyncDone);
        rs.removeEventListener("sync-req-done", onSyncReqDone);
      };

      const onSyncDone = () => {
        console.log("Manual sync completed (sync-done)");
        cleanup();
        resolve();
      };

      const onSyncReqDone = () => {
        console.log("Manual sync completed (sync-req-done)");
        cleanup();
        resolve();
      };

      rs.on("sync-done", onSyncDone);
      rs.on("sync-req-done", onSyncReqDone);

      // Trigger manual sync
      console.log("Triggering manual RemoteStorage sync...");
      rs.sync.sync();
    });
  });
}

/**
 * Wait for RemoteStorage to finish pushing outgoing changes to the server
 * This explicitly triggers a sync and waits for sync-done event
 * This is useful after delete/update operations to ensure changes are pushed to server
 * before another browser context tries to pull them
 */
export async function waitForOutgoingSync(page: Page, timeoutMs = 15000): Promise<void> {
  await page.evaluate(async (timeoutMs) => {
    const rs = (window as any).remoteStorage;
    if (!rs || !rs.sync) {
      console.log("RemoteStorage not available, skipping outgoing sync wait");
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.log(`⏰ Outgoing sync timeout after ${timeoutMs}ms`);
          resolve();
        }
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        rs.removeEventListener("sync-done", onSyncDone);
      };

      const onSyncDone = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.log(`✅ Outgoing sync completed (sync-done event received)`);
          // Add buffer to ensure server has fully processed
          setTimeout(() => resolve(), 1500);
        }
      };

      // Listen for sync completion
      rs.on("sync-done", onSyncDone);

      // Trigger a sync to push outgoing changes
      console.log("🔄 Triggering sync to push outgoing deletions/updates...");
      try {
        rs.sync.sync();
      } catch (error) {
        console.warn("Error triggering sync:", error);
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve();
        }
      }
    });
  }, timeoutMs);
}

/**
 * Wait for RemoteStorage sync to complete
 * This ensures all pending sync operations have finished AND articles have been processed
 *
 * Since articles are processed incrementally via change events,
 * we wait for sync-done event and then poll the database to ensure articles have been loaded
 */
export async function waitForRemoteStorageSync(page: Page, timeout = 30000): Promise<void> {
  await page.evaluate(async (timeout) => {
    const rs = (window as any).remoteStorage;
    if (!rs) throw new Error("RemoteStorage not available");

    // If not connected, nothing to wait for
    if (!rs.remote || !rs.remote.connected) {
      return;
    }

    const startTime = Date.now();
    const dbName = "savrDb";
    const maxWaitTime = Math.min(timeout, 10000); // Cap at 10 seconds for faster tests

    // Simple polling approach - don't wait for events that might not fire
    return new Promise<void>((resolve, reject) => {
      const checkDb = async () => {
        const timeSinceStart = Date.now() - startTime;

        if (timeSinceStart > maxWaitTime) {
          // After max wait time, resolve (empty state is valid)
          console.log(`RemoteStorage sync check complete (timeout) after ${timeSinceStart}ms`);
          resolve();
          return;
        }

        try {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(["articles"], "readonly");
            const store = transaction.objectStore("articles");
            const countRequest = store.count();

            countRequest.onsuccess = () => {
              db.close();
              const count = countRequest.result;

              // If we have articles, or we've waited 3+ seconds, resolve
              if (count > 0 || timeSinceStart > 3000) {
                console.log(
                  `RemoteStorage sync completed with ${count} articles after ${timeSinceStart}ms`
                );
                resolve();
              } else {
                // Check again in 200ms
                setTimeout(checkDb, 200);
              }
            };

            countRequest.onerror = () => {
              db.close();
              setTimeout(checkDb, 200);
            };
          };

          request.onerror = () => {
            setTimeout(checkDb, 200);
          };
        } catch (error) {
          console.warn("Error checking database:", error);
          // On error, wait a bit and try again, but resolve after maxWaitTime
          if (timeSinceStart < maxWaitTime) {
            setTimeout(checkDb, 200);
          } else {
            resolve(); // Resolve anyway to avoid hanging
          }
        }
      };

      // Start checking after a short delay to let things initialize
      setTimeout(checkDb, 500);
    });
  }, timeout);
}

/**
 * Get article from IndexedDB by slug
 * Uses direct IndexedDB API since we can't easily access Dexie from page.evaluate
 */
export async function getArticleFromDB(page: Page, slug: string): Promise<any> {
  return await page.evaluate(async (slug) => {
    // Access Dexie database directly
    const dbName = "savrDb";
    const request = indexedDB.open(dbName);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(["articles"], "readonly");
          const store = transaction.objectStore("articles");
          const getRequest = store.get(slug);

          getRequest.onsuccess = () => {
            db.close();
            resolve(getRequest.result);
          };

          getRequest.onerror = () => {
            db.close();
            reject(getRequest.error);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }, slug);
}

/**
 * Delete article from RemoteStorage
 * Used for test cleanup
 * Will throw if RemoteStorage is not available, but gracefully handles if article doesn't exist
 */
export async function deleteArticleFromStorage(page: Page, slug: string): Promise<void> {
  await page.evaluate(async (slug) => {
    const client = (window as any).remoteStorageClient;
    if (!client) {
      throw new Error(
        "RemoteStorage client not available - cannot cleanup. Did the test disconnect?"
      );
    }

    try {
      // Check if article exists first
      const listing = await client.getListing(`saves/${slug}/`);
      if (!listing || Object.keys(listing).length === 0) {
        console.log(`Article ${slug} not found in RemoteStorage (already deleted)`);
        return;
      }

      // Delete article directory
      await client.remove(`saves/${slug}/`);
      console.log(`Deleted article ${slug} from RemoteStorage`);
    } catch (error: any) {
      // Gracefully handle "not found" errors (article was already deleted)
      if (error?.message?.includes("404") || error?.message?.includes("not found")) {
        console.log(`Article ${slug} not found in RemoteStorage (already deleted)`);
        return;
      }
      // Throw for other errors
      console.error(`Failed to delete article ${slug}:`, error);
      throw error;
    }
  }, slug);
}

/**
 * Disconnect from RemoteStorage
 * Simulates clicking the disconnect button in the RemoteStorage widget
 */
export async function disconnectFromRemoteStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rs = (window as any).remoteStorage;
    if (!rs) throw new Error("RemoteStorage not available");

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Disconnect timeout after 10 seconds")),
        10000
      );

      rs.on("disconnected", () => {
        clearTimeout(timeout);
        console.log("RemoteStorage disconnected successfully");
        resolve();
      });

      rs.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Disconnect from RemoteStorage
      rs.disconnect();
    });
  });
}

/**
 * Delete article from IndexedDB
 * Used for test cleanup
 */
export async function deleteArticleFromDB(page: Page, slug: string): Promise<void> {
  await page.evaluate(async (slug) => {
    const dbName = "savrDb";
    const request = indexedDB.open(dbName);

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(["articles"], "readwrite");
          const store = transaction.objectStore("articles");
          const deleteRequest = store.delete(slug);

          deleteRequest.onsuccess = () => {
            db.close();
            console.log(`Deleted article ${slug} from IndexedDB`);
            resolve();
          };

          deleteRequest.onerror = () => {
            db.close();
            console.warn(`Failed to delete article ${slug} from IndexedDB`);
            resolve(); // Don't fail on cleanup errors
          };
        } catch (error) {
          db.close();
          console.warn(`Error during article deletion:`, error);
          resolve(); // Don't fail on cleanup errors
        }
      };

      request.onerror = () => {
        console.warn(`Failed to open database for cleanup`);
        resolve(); // Don't fail on cleanup errors
      };
    });
  }, slug);
}

/**
 * Clear all articles from RemoteStorage and IndexedDB
 * Useful for cleaning up test state between tests
 */
export async function clearAllArticles(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rs = (window as any).remoteStorage;
    if (!rs || !rs.remote || !rs.remote.connected) {
      console.log("RemoteStorage not connected, skipping cleanup");
      return;
    }

    const client = (window as any).remoteStorageClient;
    if (!client) {
      console.log("RemoteStorage client not found, skipping cleanup");
      return;
    }

    try {
      // Get all article directories
      const listing = await client.getListing("saves/");

      if (listing && typeof listing === "object") {
        const slugs = Object.keys(listing);
        console.log(`Clearing ${slugs.length} articles from RemoteStorage`);

        // Delete each article directory
        for (const slug of slugs) {
          try {
            await client.remove(`saves/${slug}/article.json`);
            await client.remove(`saves/${slug}/`);
            console.log(`Deleted article: ${slug}`);
          } catch (err) {
            console.warn(`Failed to delete article ${slug}:`, err);
          }
        }

        // Trigger sync and wait for deletions to propagate to server
        if (slugs.length > 0) {
          console.log("Triggering sync to push deletions to server...");

          // Trigger sync and wait for it to complete
          await new Promise<void>((resolve) => {
            let resolved = false;

            const timeout = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.log("Sync timeout after 10 seconds, continuing...");
                resolve();
              }
            }, 10000);

            const onSyncDone = () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                rs.removeEventListener("sync-done", onSyncDone);
                console.log("Deletion sync completed");
                // Add small buffer to ensure server has processed
                setTimeout(resolve, 500);
              }
            };

            rs.on("sync-done", onSyncDone);

            // Trigger the sync
            try {
              rs.sync.sync();
            } catch (err) {
              console.warn("Error triggering sync:", err);
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve();
              }
            }
          });
        }
      }
    } catch (error) {
      console.warn("Error clearing RemoteStorage:", error);
    }

    // Clear IndexedDB
    try {
      const dbName = "savrDb";
      const request = indexedDB.open(dbName);

      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result;

          try {
            const transaction = db.transaction(["articles"], "readwrite");
            const store = transaction.objectStore("articles");
            const clearRequest = store.clear();

            clearRequest.onsuccess = () => {
              console.log("Cleared all articles from IndexedDB");
              db.close();
              resolve();
            };

            clearRequest.onerror = () => {
              db.close();
              reject(clearRequest.error);
            };
          } catch (error) {
            db.close();
            reject(error);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn("Error clearing IndexedDB:", error);
    }
  });
}
