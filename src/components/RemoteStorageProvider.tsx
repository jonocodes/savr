import React, { createContext, useContext, useState, useEffect } from "react";
import RemoteStorage from "remotestoragejs";
import { init } from "~/utils/storage";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { useLocation } from "@tanstack/react-router";
import { SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies";
// import { isPWAMode, isOnWiFi, onNetworkChange } from "~/utils/network"; // Disabled - WiFi-only sync feature not working correctly

type RemoteStorageContextType = {
  remoteStorage: RemoteStorage | null;
  client: BaseClient | null;
  widget: any | null;
};

const RemoteStorageContext = createContext<RemoteStorageContextType>({
  remoteStorage: null,
  client: null,
  widget: null,
});

// Module-level flag to prevent double initialization across StrictMode remounts
let widgetInitialized = false;
let widgetInstance: any = null;

// Helper function to get sync enabled state from cookies
const getSyncEnabled = (): boolean => {
  const syncCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SYNC_ENABLED_COOKIE_NAME}=`));
  if (syncCookie) {
    return syncCookie.split("=")[1] === "true";
  }
  return true; // Default to enabled
};

export const RemoteStorageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [remoteStorage, setRemoteStorage] = useState<RemoteStorage | null>(null);
  const [client, setClient] = useState<BaseClient | null>(null);
  const [widget, setWidget] = useState<any>(null);
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true);
  const location = useLocation();

  // Initialize remote storage and widget (runs once)
  useEffect(() => {
    if (widgetInitialized) {
      if (widgetInstance) {
        setWidget(widgetInstance);
      }
      return;
    }

    widgetInitialized = true;

    const initializeStorage = async () => {
      const isSyncEnabled = getSyncEnabled();
      setSyncEnabled(isSyncEnabled);

      const { remoteStorage: store, client } = await init();
      setRemoteStorage(store);
      setClient(client);

      // Add test hook (debug mode only)
      if (typeof window !== "undefined" && import.meta.env.VITE_DEBUG) {
        (window as any).remoteStorage = store;
        (window as any).remoteStorageClient = client;
      }

      if (typeof window !== "undefined") {
        // Check if widget already exists in DOM
        const existingWidget = document.getElementById("remotestorage-widget");
        if (existingWidget || widgetInstance) {
          return;
        }

        // Create widget
        const { default: Widget } = await import("remotestorage-widget");
        const newWidget = new Widget(store);
        newWidget.attach("remotestorage-container");
        widgetInstance = newWidget;
        setWidget(newWidget);
        // Note: Initial visibility is handled by the visibility effect
        // which will re-run when setWidget triggers a state update
      }
    };

    initializeStorage();
  }, []);

  // Monitor cookie changes for sync setting
  useEffect(() => {
    const checkSyncSetting = () => {
      const isSyncEnabled = getSyncEnabled();
      if (isSyncEnabled !== syncEnabled) {
        setSyncEnabled(isSyncEnabled);
      }
    };

    const interval = setInterval(checkSyncSetting, 1000);
    return () => clearInterval(interval);
  }, [syncEnabled]);

  // Update widget visibility based on route and sync state
  // This effect re-runs when widget is created, route changes, or sync setting changes
  useEffect(() => {
    const widgetElement = document.getElementById("remotestorage-widget");
    if (!widgetElement) return;

    const isArticlePage = location.pathname.startsWith("/article/");
    const shouldShowWidget = syncEnabled && !isArticlePage;
    widgetElement.style.display = shouldShowWidget ? "block" : "none";
  }, [widget, syncEnabled, location.pathname]);

  // DISABLED - WiFi-only sync feature not working correctly
  // Control sync based on WiFi status (only in PWA mode)
  // useEffect(() => {
  //   if (!remoteStorage || !isPWAMode()) {
  //     // If not in PWA mode or remoteStorage not initialized, don't control sync
  //     return;
  //   }

  //   const checkAndControlSync = () => {
  //     const wifiOnlyEnabled = getWiFiOnlySyncFromCookie();
  //     const currentlyOnWiFi = isOnWiFi();

  //     // If WiFi-only is enabled and we're not on WiFi, stop sync
  //     if (wifiOnlyEnabled && !currentlyOnWiFi) {
  //       console.log("📴 Sync paused: WiFi-only mode enabled and not on WiFi");
  //       try {
  //         remoteStorage.stopSync();
  //       } catch (error) {
  //         console.warn("Failed to stop sync:", error);
  //       }
  //     } else {
  //       // Otherwise, ensure sync is running
  //       console.log("🔄 Sync active");
  //       try {
  //         remoteStorage.startSync();
  //       } catch (error) {
  //         console.warn("Failed to start sync:", error);
  //       }
  //     }
  //   };

  //   // Check sync status on mount
  //   checkAndControlSync();

  //   // Monitor network changes
  //   const cleanupNetworkListener = onNetworkChange(() => {
  //     console.log("Network change detected, checking sync status...");
  //     checkAndControlSync();
  //   });

  //   // Monitor WiFi-only preference changes
  //   const intervalId = setInterval(checkAndControlSync, 2000);

  //   return () => {
  //     cleanupNetworkListener();
  //     clearInterval(intervalId);
  //   };
  // }, [remoteStorage]);

  return (
    <RemoteStorageContext.Provider value={{ remoteStorage, client, widget }}>
      <div
        id="remotestorage-container"
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: 1000,
        }}
      />
      {children}
    </RemoteStorageContext.Provider>
  );
};

export function useRemoteStorage() {
  return useContext(RemoteStorageContext);
}
