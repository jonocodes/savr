
// content-script.js
console.log("[content-script.js] Content script loaded");

// Use chrome or browser API depending on the browser
// const api = typeof browser !== 'undefined' ? browser : chrome;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[content-script.js] Received message from background:", request);

  if (request.type === "PING") {
    console.log("[content-script.js] Sending PONG response");
    sendResponse({ type: "PONG" });
    return true; // Required for asynchronous sendResponse
  }

  if (request.type === "EXT_TO_PAGE") {
    console.log("[content-script.js] Relaying message to page:", request.payload);
    window.postMessage(
      {
        _extNS: "page-messenger",
        type: "EXT_TO_PAGE",
        payload: request.payload,
      },
      window.origin
    );
    sendResponse({ relayed: true });
    return true; // Required for asynchronous sendResponse
  }
});

window.addEventListener("message", (event) => {
  // Only accept messages from the same page context
  if (event.source !== window) return;
  if (event.origin !== window.origin) return;

  const data = event.data;
  if (!data || data._extNS !== "page-messenger") return;

  // Only forward the specific type we expect
  if (data.type === "PAGE_TO_EXT") {
    console.log("[content-script.js] Received message from page:", data.payload);
    chrome.runtime.sendMessage({
      _extNS: "page-messenger",
      type: "PAGE_TO_EXT",
      payload: data.payload
    });
  }
});
