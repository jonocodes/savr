import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import RemoteStorage from "remotestoragejs";
import { init } from "~/utils/storage";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { useRouter } from "@tanstack/react-router";

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

export const RemoteStorageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [remoteStorage, setRemoteStorage] = useState<RemoteStorage | null>(null);
  const [client, setClient] = useState<BaseClient | null>(null);
  const [widget, setWidget] = useState<any>(null);
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true);
  const router = useRouter();
  // const widgetContainerRef = useRef<View>(null);

  useEffect(() => {
    // Get sync setting from cookies
    const getSyncEnabled = () => {
      const syncCookie = document.cookie.split("; ").find((row) => row.startsWith("syncEnabled="));
      if (syncCookie) {
        const syncValue = syncCookie.split("=")[1];
        return syncValue === "true";
      }
      return true; // Default to enabled
    };

    const initializeStorage = async () => {
      const isSyncEnabled = getSyncEnabled();
      setSyncEnabled(isSyncEnabled);

      // Always initialize remote storage, but control widget visibility
      const { remoteStorage: store, client } = await init();
      setRemoteStorage(store);
      setClient(client);

      if (typeof window !== "undefined") {
        // Check if widget already exists
        const existingWidget = document.getElementById("remotestorage-widget");
        if (!existingWidget) {
          // Dynamically import the widget to avoid SSR issues
          const { default: Widget } = await import("remotestorage-widget");
          const newWidget = new Widget(store);
          // You can customize the widget here if needed
          // newWidget.leaveOpen = true; // Example customization

          // Attach the widget to a DOM element
          newWidget.attach("remotestorage-container"); // This will look for an element with id="remotestorage-container"
          setWidget(newWidget);

          // Set initial visibility based on sync setting
          setTimeout(() => {
            const widgetElement = document.getElementById("remotestorage-widget");
            if (widgetElement) {
              widgetElement.style.display = isSyncEnabled ? "block" : "none";
            }
          }, 100);
        }
      }
    };

    initializeStorage();

    // Listen for cookie changes
    const checkSyncSetting = () => {
      const isSyncEnabled = getSyncEnabled();
      if (isSyncEnabled !== syncEnabled) {
        setSyncEnabled(isSyncEnabled);

        // Always try to find the widget element
        const widgetElement = document.getElementById("remotestorage-widget");
        if (widgetElement) {
          if (!isSyncEnabled) {
            // Hide widget when sync is disabled
            widgetElement.style.display = "none";
          } else {
            // Show widget when sync is enabled
            widgetElement.style.display = "block";
          }
        }
      }
    };

    // Function to update widget visibility based on current route and sync setting
    const updateWidgetVisibility = () => {
      const isSyncEnabled = getSyncEnabled();
      const isArticlePage = router.state.location.pathname.startsWith("/article/");
      const shouldShowWidget = isSyncEnabled && !isArticlePage;

      const widgetElement = document.getElementById("remotestorage-widget");
      if (widgetElement) {
        widgetElement.style.display = shouldShowWidget ? "block" : "none";
      }
    };

    // Check for cookie changes periodically
    const interval = setInterval(() => {
      checkSyncSetting();
      updateWidgetVisibility(); // Also update on route changes
    }, 1000);

    // Initial widget visibility update
    setTimeout(updateWidgetVisibility, 100);

    // Cleanup function
    return () => {
      clearInterval(interval);
      if (widget && typeof window !== "undefined") {
        // There's no official detach method, but you might want to remove the DOM element
        const widgetElement = document.getElementById("remotestorage-widget");
        if (widgetElement && widgetElement.parentNode) {
          widgetElement.parentNode.removeChild(widgetElement);
        }
      }
    };
  }, [router.state.location.pathname]); // Add router dependency to update on route changes

  return (
    <RemoteStorageContext.Provider value={{ remoteStorage, client, widget }}>
      {/* This div is where the widget will be attached */}
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
