import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createRouter } from "./router";
import { initTelemetry, trackAppOpen } from "./utils/telemetry";
import { getStoredCorsProxy } from "./utils/net/corsProxy";
import "./styles/app.css";

const router = createRouter();

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Initialize the router and render the app
async function initApp() {
  // Anonymous usage telemetry (no-op unless configured + consented). Fires one
  // "app open" reach/geo beacon per load; see src/utils/telemetry.ts.
  initTelemetry();
  trackAppOpen();

  // One-time: move a legacy CORS proxy cookie (which may hold a secret token)
  // into localStorage and delete the cookie, so it stops being sent here.
  getStoredCorsProxy();

  await router.load();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}

initApp();
