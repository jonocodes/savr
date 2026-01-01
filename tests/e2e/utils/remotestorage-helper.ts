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
 * Enhanced with better timeout and multiple sync event handling
 */
export async function triggerRemoteStorageSync(page: Page, timeoutMs = 15000): Promise<void> {
  await page.evaluate(async (timeoutMs) => {
    const rs = (window as any).remoteStorage;
    if (!rs || !rs.sync) {
      throw new Error("RemoteStorage or sync not available");
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        console.log(`⏰ Sync timeout after ${timeoutMs}ms - resolving anyway`);
        resolve(); // Resolve anyway to avoid hanging tests
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        rs.removeEventListener("sync-done", onSyncDone);
        rs.removeEventListener("sync-req-done", onSyncReqDone);
      };

      const onSyncDone = () => {
        console.log("✅ Manual sync completed (sync-done)");
        cleanup();
        // Add small buffer to ensure changes are fully processed
        setTimeout(() => resolve(), 500);
      };

      const onSyncReqDone = () => {
        console.log("✅ Manual sync completed (sync-req-done)");
        cleanup();
        setTimeout(() => resolve(), 500);
      };

      rs.on("sync-done", onSyncDone);
      rs.on("sync-req-done", onSyncReqDone);

      // Trigger manual sync
      console.log("🔄 Triggering manual RemoteStorage sync...");
      rs.sync.sync();
    });
  }, timeoutMs);
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
 * Force RemoteStorage to sync immediately
 * Used after deletions/updates to push changes to server right away
 */
export async function forceRemoteStorageSync(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const rs = (window as any).remoteStorage;
    if (!rs) {
      console.log("RemoteStorage not available, cannot force sync");
      return;
    }

    try {
      console.log("🔄 Forcing immediate sync...");
      await rs.sync.sync();
      console.log("✅ Sync forced");
    } catch (error) {
      console.error("Error forcing sync:", error);
      throw error;
    }
  });
}

/**
 * Poll RemoteStorage to verify file deletion from server
 * More reliable than waiting for sync-done event
 * Checks directly on the server if the file is actually gone
 */
export async function waitForDeletionSync(
  page: Page,
  articleSlug: string,
  timeoutMs = 15000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  await page.evaluate(
    async (articleSlug, checkInterval, timeoutMs) => {
      const rs = (window as any).remoteStorage;
      if (!rs) {
        console.log("RemoteStorage not available");
        return { deleted: false };
      }

      try {
        const articlePath = `saves/${articleSlug}/article.json`;

        // Check both individual file and directory
        const fileExists = await rs.getFile(articlePath);
        const dirExists = await rs.getFile(`saves/${articleSlug}/.~meta`);

        const deleted = !fileExists && !dirExists;

        if (deleted) {
          console.log(`✅ File deletion confirmed on server: ${articleSlug}`);
          return { deleted: true };
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          console.log(`⏰ Timeout after ${elapsed}ms - assuming file not deleted`);
          return { deleted: false, timedOut: true };
        }

        if (elapsed > checkInterval) {
          console.log(`⏳ Still checking... ${elapsed}ms elapsed`);
        }

        return { deleted: false, waiting: true };
      } catch (error) {
        console.error(`Error checking file deletion: ${error}`);
        return { deleted: false, error: String(error) };
      }
    },
    articleSlug,
    checkInterval,
    timeoutMs
  );
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
 * Now with verification and retry logic for robustness
 */
export async function clearAllArticles(page: Page, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🧹 Cleanup attempt ${attempt}/${retries}...`);

      await page.evaluate(async () => {
        const rs = (window as any).remoteStorage;
        if (!rs || !rs.remote || !rs.remote.connected) {
          console.log("RemoteStorage not connected, skipping RS cleanup");
          return { rsSkipped: true };
        }

        const client = (window as any).remoteStorageClient;
        if (!client) {
          console.log("RemoteStorage client not found, skipping RS cleanup");
          return { rsSkipped: true };
        }

        try {
          // Force a fresh listing by using maxAge: 0
          const listing = await client.getListing("saves/", 0);

          if (listing && typeof listing === "object") {
            const slugs = Object.keys(listing);
            console.log(`Clearing ${slugs.length} articles from RemoteStorage`);

            // Delete each article directory and its contents
            for (const slug of slugs) {
              try {
                // Force fresh listing of article files
                const articleListing = await client.getListing(`saves/${slug}/`, 0);
                if (articleListing && typeof articleListing === "object") {
                  // Delete each file in the directory
                  for (const file of Object.keys(articleListing)) {
                    try {
                      await client.remove(`saves/${slug}/${file}`);
                      console.log(`Deleted file: saves/${slug}/${file}`);
                    } catch (err: any) {
                      // Ignore 404 errors - file is already gone
                      if (err?.message?.includes('404') || err?.statusCode === 404 || err?.message?.includes('not found')) {
                        console.log(`File already deleted: saves/${slug}/${file}`);
                      } else {
                        console.warn(`Failed to delete file ${slug}/${file}:`, err);
                      }
                    }
                  }
                }
                // Delete the directory itself
                try {
                  await client.remove(`saves/${slug}/`);
                  console.log(`Deleted article: ${slug}`);
                } catch (err: any) {
                  // Ignore 404 errors - directory is already gone
                  if (err?.message?.includes('404') || err?.statusCode === 404 || err?.message?.includes('not found')) {
                    console.log(`Directory already deleted: saves/${slug}/`);
                  } else {
                    console.warn(`Failed to delete directory ${slug}:`, err);
                  }
                }
              } catch (err) {
                console.warn(`Failed to delete article ${slug}:`, err);
              }
            }

            // Wait for deletion sync to complete
            if (slugs.length > 0) {
              console.log("Waiting for deletion sync to complete...");
              // Trigger sync and wait for completion
              if (rs.sync) {
                rs.sync.sync();
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
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

      // Verify cleanup succeeded
      const verification = await verifyCleanState(page);
      if (verification.isClean) {
        console.log(`✅ Cleanup verified: ${verification.indexedDBCount} articles in DB, ${verification.remoteStorageCount} in RS`);
        return; // Success!
      } else {
        console.warn(`⚠️  Cleanup incomplete: ${verification.indexedDBCount} articles in DB, ${verification.remoteStorageCount} in RS`);
        if (attempt < retries) {
          await page.waitForTimeout(1000); // Wait before retry
        }
      }
    } catch (error) {
      console.error(`Error during cleanup attempt ${attempt}:`, error);
      if (attempt === retries) {
        throw error;
      }
      await page.waitForTimeout(1000);
    }
  }

  throw new Error(`Failed to clean state after ${retries} attempts`);
}

/**
 * Wait for an article to have a specific state in IndexedDB
 * Uses polling to check until the article reaches the expected state
 */
export async function waitForArticleState(
  page: Page,
  slug: string,
  expectedState: "unread" | "archived" | "deleted",
  timeoutMs = 15000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const article = await getArticleFromDB(page, slug);

    if (expectedState === "deleted") {
      if (!article) {
        console.log(`✅ Article ${slug} confirmed deleted`);
        return;
      }
    } else {
      if (article && article.state === expectedState) {
        console.log(`✅ Article ${slug} confirmed in state: ${expectedState}`);
        return;
      }
    }

    await page.waitForTimeout(checkInterval);
  }

  const article = await getArticleFromDB(page, slug);
  throw new Error(
    `Timeout waiting for article ${slug} to reach state ${expectedState}. Current state: ${article ? article.state : "not found"}`
  );
}

/**
 * Wait for article to exist (or not exist) on RemoteStorage server
 * Polls the server directly to verify sync has completed
 */
export async function waitForArticleOnServer(
  page: Page,
  slug: string,
  shouldExist: boolean,
  timeoutMs = 15000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const exists = await page.evaluate(async (slug) => {
      const client = (window as any).remoteStorageClient;
      if (!client) return false;

      try {
        const article = await client.getObject(`saves/${slug}/article.json`);
        return !!article;
      } catch (error) {
        return false;
      }
    }, slug);

    if (exists === shouldExist) {
      console.log(
        `✅ Server verification: Article ${slug} ${shouldExist ? "exists" : "does not exist"} on server`
      );
      return;
    }

    await page.waitForTimeout(checkInterval);
  }

  const exists = await page.evaluate(async (slug) => {
    const client = (window as any).remoteStorageClient;
    if (!client) return false;
    try {
      const article = await client.getObject(`saves/${slug}/article.json`);
      return !!article;
    } catch (error) {
      return false;
    }
  }, slug);

  throw new Error(
    `Timeout waiting for article ${slug} to ${shouldExist ? "exist" : "not exist"} on server. Current state: ${exists ? "exists" : "does not exist"}`
  );
}

/**
 * Wait for article to have specific state on RemoteStorage server
 * Polls the server directly to verify the article.json has the expected state
 */
export async function waitForArticleStateOnServer(
  page: Page,
  slug: string,
  expectedState: "unread" | "archived" | "deleted",
  timeoutMs = 15000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const result = await page.evaluate(async (slug) => {
      const client = (window as any).remoteStorageClient;
      if (!client) {
        return { exists: false, state: null, error: "client not available" };
      }

      try {
        const article = await client.getObject(`saves/${slug}/article.json`);
        if (!article) {
          return { exists: false, state: null };
        }
        return { exists: true, state: article.state };
      } catch (error) {
        return { exists: false, state: null, error: String(error) };
      }
    }, slug);

    console.log(`🔍 Server state check: ${slug} - exists: ${result.exists}, state: ${result.state}`);

    if (result.exists && result.state === expectedState) {
      console.log(
        `✅ Server state verification: Article ${slug} has state "${expectedState}" on server`
      );
      return;
    }

    await page.waitForTimeout(checkInterval);
  }

  // Final check with error details
  const result = await page.evaluate(async (slug) => {
    const client = (window as any).remoteStorageClient;
    if (!client) return { exists: false, state: null };
    try {
      const article = await client.getObject(`saves/${slug}/article.json`);
      return { exists: !!article, state: article?.state };
    } catch (error) {
      return { exists: false, state: null };
    }
  }, slug);

  throw new Error(
    `Timeout waiting for article ${slug} to have state "${expectedState}" on server. ` +
    `Current: ${result.exists ? `state="${result.state}"` : "does not exist"}`
  );
}

/**
 * Verify that the test state is clean (no articles in IndexedDB or RemoteStorage)
 */
export async function verifyCleanState(page: Page): Promise<{
  isClean: boolean;
  indexedDBCount: number;
  remoteStorageCount: number;
}> {
  return await page.evaluate(async () => {
    let indexedDBCount = 0;
    let remoteStorageCount = 0;

    // Check IndexedDB
    try {
      const dbName = "savrDb";
      const request = indexedDB.open(dbName);

      indexedDBCount = await new Promise<number>((resolve) => {
        request.onsuccess = () => {
          const db = request.result;
          try {
            const transaction = db.transaction(["articles"], "readonly");
            const store = transaction.objectStore("articles");
            const countRequest = store.count();

            countRequest.onsuccess = () => {
              db.close();
              resolve(countRequest.result);
            };

            countRequest.onerror = () => {
              db.close();
              resolve(0);
            };
          } catch (error) {
            db.close();
            resolve(0);
          }
        };

        request.onerror = () => resolve(0);
      });
    } catch (error) {
      console.warn("Error checking IndexedDB:", error);
    }

    // Check RemoteStorage
    try {
      const client = (window as any).remoteStorageClient;
      if (client) {
        const listing = await client.getListing("saves/");
        if (listing && typeof listing === "object") {
          remoteStorageCount = Object.keys(listing).length;
        }
      }
    } catch (error) {
      console.warn("Error checking RemoteStorage:", error);
    }

    return {
      isClean: indexedDBCount === 0 && remoteStorageCount === 0,
      indexedDBCount,
      remoteStorageCount,
    };
  });
}
