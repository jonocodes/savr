// background.js
console.log("[background.js] Background script loaded");

// Use chrome or
// const api = typeof chrome !== 'undefined' ? chrome : browser;
// const api = chrome;



// In your service worker (e.g., background.js)
// chrome.action.onClicked.addListener((tab) => {
//     console.log("Action icon clicked!");
//     // Your logic here, e.g., opening a new tab, running a script, etc.
// });


chrome.action.onClicked.addListener(async () => {
  console.log("[background.js] Extension icon clicked");
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab) {
      console.error("[background.js] No active tab found");
      return;
    }

    // First, try to ping the content script to see if it's there
    const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: "PING" });
    console.log("[background.js] Ping response:", pingResponse);

    if (pingResponse && pingResponse.type === "PONG") {
      // Content script is present, send the message
      console.log("[background.js] Content script is present, sending message to content script");
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "EXT_TO_PAGE",
        payload: { message: "Hello from extension!" },
      });
      console.log("[background.js] Response from content script:", response);
    } else {
      console.warn("[background.js] Content script not available");
    }
  } catch (error) {
    console.error("[background.js] Error:", error);
  }
});
