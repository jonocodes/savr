import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { getAfterExternalSaveFromCookie, AFTER_EXTERNAL_SAVE_ACTIONS } from "~/utils/cookies";
import * as React from "react";

export const Route = createFileRoute("/share-handler")({
  component: ShareHandler,
});

function ShareHandler() {
  const navigate = useNavigate();

  // Get URL parameters from the share intent
  const urlParams = new URLSearchParams(window.location.search);

  alert("ShareHandler urlParams: " + JSON.stringify(urlParams));

  const sharedUrl = urlParams.get("url");
  const sharedText = urlParams.get("text") || urlParams.get("content");

  // Auto-redirect after 2 seconds using proper React navigation
  React.useEffect(() => {
    if (sharedUrl) {
      const timer = setTimeout(() => {
        navigate({ to: "/", search: { saveUrl: sharedUrl, autoSubmit: "true" } });
      }, 2000);

      return () => clearTimeout(timer);
    } else {
      // If no URL, redirect to home
      const timer = setTimeout(() => {
        navigate({ to: "/" });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [sharedUrl, navigate]);

  // Show a brief debug message before redirecting
  if (sharedUrl) {
    const afterExternalSave = getAfterExternalSaveFromCookie();

    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h3>Processing shared URL...</h3>
        <p>URL: {sharedUrl}</p>
        <p>Current page: {window.location.href}</p>
        <p>
          After save action:{" "}
          {afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE
            ? "Show article content"
            : afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST
              ? "Show article list"
              : "Close tab"}
        </p>
        <p>Redirecting in 2 seconds...</p>
      </div>
    );
  }

  // If no URL, show message and redirect
  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h3>No URL found</h3>
      <p>Redirecting to home...</p>
    </div>
  );
}
