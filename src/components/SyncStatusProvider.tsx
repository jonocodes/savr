import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { isOnWiFi, onNetworkChange, isNetworkInfoSupported } from "~/utils/network";
import { /* getWiFiOnlySyncFromCookie, */ SYNC_ENABLED_COOKIE_NAME, SYNC_SETTING_EVENT } from "~/utils/cookies"; // Disabled WiFi-only sync

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
  const [syncEnabled, setSyncEnabled] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const syncCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${SYNC_ENABLED_COOKIE_NAME}=`));
    return syncCookie ? syncCookie.split("=")[1] === "true" : true;
  });
  // DISABLED - WiFi-only sync feature not working correctly
  // const [wiFiOnlySync, setWiFiOnlySync] = useState<boolean>(false);
  const isNetworkSupported = isNetworkInfoSupported();

  // React to sync-setting changes dispatched by PreferenceScreen
  useEffect(() => {
    const handleSyncSettingChanged = (e: Event) => {
      setSyncEnabled((e as CustomEvent<{ enabled: boolean }>).detail.enabled);
    };
    window.addEventListener(SYNC_SETTING_EVENT, handleSyncSettingChanged);
    return () => window.removeEventListener(SYNC_SETTING_EVENT, handleSyncSettingChanged);
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
