import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getAfterExternalSaveFromCookie, AFTER_EXTERNAL_SAVE_ACTIONS } from "~/utils/cookies";
import * as React from "react";
import { isDebugMode } from "~/config/environment";

export const Route = createFileRoute("/share-handler")({
  component: ShareHandler,
  ssr: false,
});

function ShareHandler() {
  const navigate = useNavigate();
  const debug = isDebugMode();

  // Get URL parameters from the share intent
  const urlParams = new URLSearchParams(window.location.search);
  const sharedUrl = urlParams.get("url") || urlParams.get("content") || urlParams.get("text");

  if (debug) {
    for (const [key, value] of urlParams.entries()) {
      console.log(`param ${key}: ${value}`);
    }
  }

  // Redirect to the main page (immediately in normal use; with a short delay
  // in debug mode so the diagnostic view below is readable).
  React.useEffect(() => {
    const delay = debug ? 2000 : 0;
    const navParams = sharedUrl
      ? { search: { saveUrl: sharedUrl, autoSubmit: "true" } }
      : {};

    const timer = setTimeout(() => {
      navigate({ to: "/", ...navParams });
    }, delay);

    return () => clearTimeout(timer);
  }, [sharedUrl, navigate, debug]);

  const afterExternalSave = getAfterExternalSaveFromCookie();

  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h3>Processing shared link…</h3>
      {debug && (
        <>
          <p>URL: {sharedUrl}</p>
          <p>Current page: {window.location.href}</p>
          <p>window.location.search: {window.location.search}</p>
          <p>urlParams: {JSON.stringify(Object.fromEntries(urlParams))}</p>
          <p>
            After save action:{" "}
            {afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE
              ? "Show article content"
              : afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST
                ? "Show article list"
                : "Close tab"}
          </p>
          <p>Redirecting in 2 seconds…</p>
        </>
      )}
    </div>
  );
}
