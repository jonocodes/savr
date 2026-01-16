import { useState, useEffect } from "react";
import { subscribeSyncProgress, SyncProgress } from "~/utils/storage";

/**
 * Hook to track sync progress from RemoteStorage
 * Returns current sync state including whether sync is active and progress
 */
export function useSyncProgress(): SyncProgress {
  const [progress, setProgress] = useState<SyncProgress>({
    isSyncing: false,
    totalArticles: 0,
    processedArticles: 0,
    phase: "idle",
  });

  useEffect(() => {
    const unsubscribe = subscribeSyncProgress((newProgress) => {
      setProgress(newProgress);
    });

    return unsubscribe;
  }, []);

  return progress;
}
