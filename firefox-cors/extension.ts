const pwaOrigin = "http://localhost:8081";

browser.webRequest.onHeadersReceived.addListener(
  function (details) {
    const headers = details.responseHeaders;

    // Check if the request originated from the PWA
    if (details.originUrl && details.originUrl.startsWith(pwaOrigin)) {
      // Remove existing CORS headers to avoid conflicts
      for (let i = headers.length - 1; i >= 0; i--) {
        const headerName = headers[i].name.toLowerCase();
        if (headerName === "access-control-allow-origin" || headerName === "access-control-allow-credentials") {
          headers.splice(i, 1);
        }
      }

      // Add the necessary CORS headers
      headers.push({ name: "Access-Control-Allow-Origin", value: details.originUrl });
      headers.push({ name: "Access-Control-Allow-Credentials", value: "true" });
    }

    return { responseHeaders: headers };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);

console.log("SAVR CORS Disabler extension loaded.");
