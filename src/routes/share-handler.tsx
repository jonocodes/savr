import { createFileRoute, redirect } from "@tanstack/react-router";

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
        <p>Redirecting in 2 seconds...</p>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            setTimeout(() => {
              window.location.href = "/?closeAfterSave=true&saveUrl=" + encodeURIComponent("${sharedUrl}");
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
