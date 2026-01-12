import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { isPWAMode, isOnWiFi, onNetworkChange } from "~/utils/network";
import { getWiFiOnlySyncFromCookie, SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies";

export type SyncStatus = "active" | "paused" | "disabled";

interface SyncStatusContextType {
  status: SyncStatus;
  isWiFi: boolean;
  isPWA: boolean;
}

const SyncStatusContext = createContext<SyncStatusContextType | undefined>(undefined);

interface SyncStatusProviderProps {
  children: ReactNode;
}

export function SyncStatusProvider({ children }: SyncStatusProviderProps) {
  const [isWiFi, setIsWiFi] = useState<boolean>(isOnWiFi());
  const [syncEnabled, setSyncEnabled] = useState<boolean>(false);
  const [wiFiOnlySync, setWiFiOnlySync] = useState<boolean>(false);
  const isPWA = isPWAMode();

  // Load initial sync settings
  useEffect(() => {
    const loadSettings = () => {
      // Check if sync is enabled
      const syncCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${SYNC_ENABLED_COOKIE_NAME}=`));
      if (syncCookie) {
        const syncValue = syncCookie.split("=")[1];
        setSyncEnabled(syncValue === "true");
      }

      // Check if WiFi-only mode is enabled
      setWiFiOnlySync(getWiFiOnlySyncFromCookie());
    };

    loadSettings();

    // Monitor for cookie changes (e.g., from preferences screen)
    const intervalId = setInterval(loadSettings, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Monitor network changes
  useEffect(() => {
    if (!isPWA) {
      // If not in PWA mode, always assume WiFi (don't bother monitoring)
      return;
    }

    // Set initial WiFi status
    setIsWiFi(isOnWiFi());

    // Listen for network changes
    const cleanup = onNetworkChange(() => {
      const newWiFiStatus = isOnWiFi();
      console.log("Network connection changed. WiFi:", newWiFiStatus);
      setIsWiFi(newWiFiStatus);
    });

    return cleanup;
  }, [isPWA]);

  // Calculate sync status
  const status: SyncStatus = React.useMemo(() => {
    if (!syncEnabled) {
      return "disabled";
    }

    // If not in PWA mode, WiFi-only doesn't apply
    if (!isPWA) {
      return "active";
    }

    // If WiFi-only is enabled and we're not on WiFi, pause sync
    if (wiFiOnlySync && !isWiFi) {
      return "paused";
    }

    return "active";
  }, [syncEnabled, wiFiOnlySync, isWiFi, isPWA]);

  return (
    <SyncStatusContext.Provider value={{ status, isWiFi, isPWA }}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus(): SyncStatusContextType {
  const context = useContext(SyncStatusContext);
  if (context === undefined) {
    throw new Error("useSyncStatus must be used within a SyncStatusProvider");
  }
  return context;
}
