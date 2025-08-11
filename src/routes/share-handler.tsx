import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAfterExternalSaveFromCookie, AFTER_EXTERNAL_SAVE_ACTIONS } from "~/utils/cookies";

export const Route = createFileRoute("/share-handler")({
  component: ShareHandler,
});

function ShareHandler() {
  // Get URL parameters from the share intent
  const urlParams = new URLSearchParams(window.location.search);
  const sharedUrl = urlParams.get("url");
  const sharedText = urlParams.get("text") || urlParams.get("content");

  // Show a brief debug message before redirecting
  if (sharedUrl) {
    const afterExternalSave = getAfterExternalSaveFromCookie();

    let redirectUrl = "/?saveUrl=" + encodeURIComponent(sharedUrl);

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
        <script
          dangerouslySetInnerHTML={{
            __html: `
            setTimeout(() => {
              window.location.href = "${redirectUrl}";
            }, 2000);
          `,
          }}
        />
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
      <script
        dangerouslySetInnerHTML={{
          __html: `
          setTimeout(() => {
            window.location.href = "/";
          }, 2000);
        `,
        }}
      />
    </div>
  );
}
