import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/share-handler")({
  component: ShareHandler,
});

function ShareHandler() {
  // Get URL parameters from the share intent
  const urlParams = new URLSearchParams(window.location.search);
  const sharedUrl = urlParams.get("url");
  const sharedText = urlParams.get("text");

  // Redirect to the main page with the shared URL
  if (sharedUrl) {
    window.location.href = "/?closeAfterSave=true&saveUrl=" + encodeURIComponent(sharedUrl);

    return null;
  }

  // If no URL, just redirect to main page
  window.location.href = "/";
  return null;
}
