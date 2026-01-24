import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { isOnWiFi, onNetworkChange, isNetworkInfoSupported } from "~/utils/network";
import { /* getWiFiOnlySyncFromCookie, */ SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies"; // Disabled WiFi-only sync

export type SyncStatus = "active" | "paused" | "disabled";

interface SyncStatusContextType {
  status: SyncStatus;
  isWiFi: boolean;
  isNetworkSupported: boolean;
}

const SyncStatusContext = createContext<SyncStatusContextType | undefined>(undefined);

interface SyncStatusProviderProps {
  children: ReactNode;
}

export function SyncStatusProvider({ children }: SyncStatusProviderProps) {
  const [isWiFi, setIsWiFi] = useState<boolean>(isOnWiFi());
  // Default to true to match RemoteStorageProvider behavior
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true);
  // DISABLED - WiFi-only sync feature not working correctly
  // const [wiFiOnlySync, setWiFiOnlySync] = useState<boolean>(false);
  const isNetworkSupported = isNetworkInfoSupported();

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
      // If no cookie exists, keep default of true (matching RemoteStorageProvider)

      // DISABLED - Check if WiFi-only mode is enabled
      // setWiFiOnlySync(getWiFiOnlySyncFromCookie());
    };

    loadSettings();

    // Monitor for cookie changes (e.g., from preferences screen)
    const intervalId = setInterval(loadSettings, 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Monitor network changes - works in mobile browsers, not just PWA
  useEffect(() => {
    // Listen for network changes
    const cleanup = onNetworkChange(() => {
      const newWiFiStatus = isOnWiFi();
      console.log("Network connection changed. WiFi:", newWiFiStatus);
      setIsWiFi(newWiFiStatus);
    });

    return cleanup;
  }, []);

  // Calculate sync status
  const status: SyncStatus = React.useMemo(() => {
    if (!syncEnabled) {
      return "disabled";
    }

    // DISABLED - If WiFi-only is enabled and we're not on WiFi, pause sync
    // if (wiFiOnlySync && !isWiFi) {
    //   return "paused";
    // }

    return "active";
  }, [syncEnabled]);

  return (
    <SyncStatusContext.Provider value={{ status, isWiFi, isNetworkSupported }}>
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
