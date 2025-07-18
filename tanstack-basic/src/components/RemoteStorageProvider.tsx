// In app/contexts/RemoteStorageContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import RemoteStorage from "remotestoragejs";
// import Widget from "remotestorage-widget";
import { init } from "~/utils/storage";
// import { View, Platform } from "react-native";
import BaseClient from "remotestoragejs/release/types/baseclient";

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
  // const widgetContainerRef = useRef<View>(null);

  useEffect(() => {
    const initializeStorage = async () => {
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
        }
      }
    };

    initializeStorage();

    // Cleanup function
    return () => {
      if (widget && typeof window !== "undefined") {
        // There's no official detach method, but you might want to remove the DOM element
        const widgetElement = document.getElementById("remotestorage-widget");
        if (widgetElement && widgetElement.parentNode) {
          widgetElement.parentNode.removeChild(widgetElement);
        }
      }
    };
  }, []);

  return (
    <RemoteStorageContext.Provider value={{ remoteStorage, client, widget }}>
      {/* This div is where the widget will be attached */}
      <div
        id="remotestorage-container"
        style={{ position: "fixed", bottom: "10px", right: "10px", zIndex: 1000 }}
      />
      {children}
    </RemoteStorageContext.Provider>
  );
};

export function useRemoteStorage() {
  return useContext(RemoteStorageContext);
}
