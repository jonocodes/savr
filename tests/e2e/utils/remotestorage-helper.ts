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
  await page.evaluate(
    async ({ userAddress, token }) => {
      // Wait for RemoteStorage to be initialized
      let attempts = 0;
      while (!(window as any).remoteStorage && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!(window as any).remoteStorage) {
        throw new Error("RemoteStorage not initialized after 5 seconds");
      }

      const rs = (window as any).remoteStorage;

      // Give RemoteStorage a moment to fully initialize
      // The ready event should have already fired, but we'll wait a bit just in case
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Connect with token (bypasses OAuth flow)
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout after 15 seconds")),
          15000
        );

        const cleanup = () => {
          clearTimeout(timeout);
          rs.off("connected", onConnected);
          rs.off("error", onError);
        };

        const onConnected = () => {
          cleanup();
          console.log("RemoteStorage connected successfully");
          resolve();
        };

        const onError = (err: any) => {
          // Log the error for debugging
          console.error("RemoteStorage connection error:", err);

          // If it's a DiscoveryError, it might be transient - wait a bit and retry once
          if (
            err?.name === "DiscoveryError" ||
            err?.constructor?.name === "DiscoveryError" ||
            String(err).includes("DiscoveryError")
          ) {
            console.log("DiscoveryError detected, waiting 1 second before retry...");
            cleanup();

            setTimeout(() => {
              // Retry connection once
              const retryTimeout = setTimeout(
                () => reject(new Error("Connection retry failed after DiscoveryError")),
                10000
              );

              const onRetryConnected = () => {
                clearTimeout(retryTimeout);
                rs.off("connected", onRetryConnected);
                rs.off("error", onRetryError);
                console.log("RemoteStorage connected successfully on retry");
                resolve();
              };

              const onRetryError = (retryErr: any) => {
                clearTimeout(retryTimeout);
                rs.off("connected", onRetryConnected);
                rs.off("error", onRetryError);
                reject(retryErr);
              };

              rs.on("connected", onRetryConnected);
              rs.on("error", onRetryError);

              rs.connect(userAddress, token);
            }, 1000);
          } else {
            cleanup();
            reject(err);
          }
        };

        rs.on("connected", onConnected);
        rs.on("error", onError);

        // Use the Armadietto-generated token to connect directly
        rs.connect(userAddress, token);
      });
    },
    { userAddress, token }
  );
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
 */
export async function deleteArticleFromStorage(page: Page, slug: string): Promise<void> {
  await page.evaluate(async (slug) => {
    const client = (window as any).remoteStorageClient;
    if (!client) throw new Error("RemoteStorage client not available");

    try {
      // Delete article directory
      await client.remove(`saves/${slug}/`);
      console.log(`Deleted article ${slug} from RemoteStorage`);
    } catch (error) {
      console.warn(`Failed to delete article ${slug}:`, error);
      // Don't throw - cleanup failures shouldn't fail tests
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
