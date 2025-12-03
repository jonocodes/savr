import { Page } from '@playwright/test';

/**
 * Connect to RemoteStorage programmatically using OAuth token
 * This bypasses the normal OAuth flow by using a pre-generated token from Armadietto
 */
export async function connectToRemoteStorage(
  page: Page,
  userAddress: string,
  token: string
): Promise<void> {
  await page.evaluate(async ({ userAddress, token }) => {
    // Wait for RemoteStorage to be initialized
    let attempts = 0;
    while (!(window as any).remoteStorage && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!(window as any).remoteStorage) {
      throw new Error('RemoteStorage not initialized after 5 seconds');
    }

    const rs = (window as any).remoteStorage;

    // Connect with token (bypasses OAuth flow)
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);

      rs.on('connected', () => {
        clearTimeout(timeout);
        console.log('RemoteStorage connected successfully');
        resolve();
      });

      rs.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Use the Armadietto-generated token to connect directly
      rs.connect(userAddress, token);
    });
  }, { userAddress, token });
}

/**
 * Wait for RemoteStorage sync to complete
 * This ensures all pending sync operations have finished AND the database has been rebuilt
 *
 * Since buildDbFromFiles() runs asynchronously in the 'connected' event handler,
 * we need to poll the database to ensure articles have been loaded
 */
export async function waitForRemoteStorageSync(page: Page, timeout = 30000): Promise<void> {
  await page.evaluate(async (timeout) => {
    const rs = (window as any).remoteStorage;
    if (!rs) throw new Error('RemoteStorage not available');

    // If not connected, nothing to wait for
    if (!rs.remote || !rs.remote.connected) {
      return;
    }

    // Poll the database to wait for buildDbFromFiles to complete
    const startTime = Date.now();
    const dbName = 'savrDb';

    return new Promise<void>((resolve, reject) => {
      const checkDb = async () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Database sync timeout'));
          return;
        }

        try {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['articles'], 'readonly');
            const store = transaction.objectStore('articles');
            const countRequest = store.count();

            countRequest.onsuccess = () => {
              db.close();
              const count = countRequest.result;
              console.log(`RemoteStorage sync check: ${count} articles in DB`);

              // If we have articles, the sync is complete
              // If we don't have articles after 5 seconds, assume sync is complete (no articles to sync)
              if (count > 0 || Date.now() - startTime > 5000) {
                console.log(`RemoteStorage sync completed with ${count} articles`);
                resolve();
              } else {
                // Check again in 100ms
                setTimeout(checkDb, 100);
              }
            };

            countRequest.onerror = () => {
              db.close();
              setTimeout(checkDb, 100);
            };
          };

          request.onerror = () => {
            setTimeout(checkDb, 100);
          };
        } catch (error) {
          console.warn('Error checking database:', error);
          setTimeout(checkDb, 100);
        }
      };

      checkDb();
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
    const dbName = 'savrDb';
    const request = indexedDB.open(dbName);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(['articles'], 'readonly');
          const store = transaction.objectStore('articles');
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
    if (!client) throw new Error('RemoteStorage client not available');

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
    if (!rs) throw new Error('RemoteStorage not available');

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Disconnect timeout after 10 seconds')), 10000);

      rs.on('disconnected', () => {
        clearTimeout(timeout);
        console.log('RemoteStorage disconnected successfully');
        resolve();
      });

      rs.on('error', (err: Error) => {
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
    const dbName = 'savrDb';
    const request = indexedDB.open(dbName);

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(['articles'], 'readwrite');
          const store = transaction.objectStore('articles');
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
