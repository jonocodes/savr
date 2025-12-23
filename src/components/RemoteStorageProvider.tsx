import React, { createContext, useContext, useState, useEffect } from "react";
import RemoteStorage from "remotestoragejs";
import { init } from "~/utils/storage";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { useRouter } from "@tanstack/react-router";
import { SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies";

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
  const router = useRouter();

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

        // Set initial visibility
        setTimeout(() => {
          const widgetElement = document.getElementById("remotestorage-widget");
          if (widgetElement) {
            widgetElement.style.display = isSyncEnabled ? "block" : "none";
          }
        }, 100);
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

  // Update widget visibility based on route
  useEffect(() => {
    const widgetElement = document.getElementById("remotestorage-widget");
    if (widgetElement) {
      const isArticlePage = router.state.location.pathname.startsWith("/article/");
      const shouldShowWidget = syncEnabled && !isArticlePage;
      widgetElement.style.display = shouldShowWidget ? "block" : "none";
    }
  }, [router.state.location.pathname, syncEnabled]);

  return (
    <RemoteStorageContext.Provider value={{ remoteStorage, client, widget }}>
      <div
        id="remotestorage-container"
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: 1000,
          display:
            syncEnabled && !router.state.location.pathname.startsWith("/article/")
              ? "block"
              : "none",
        }}
      />
      {children}
    </RemoteStorageContext.Provider>
  );
};

export function useRemoteStorage() {
  return useContext(RemoteStorageContext);
}
