/// <reference types="chrome" />

interface MessageSource {
  source: "SAVR_EXTENSION" | "SAVR_PWA";
}

interface ForwardToPWAMessage extends MessageSource {
  action: "forwardToPWA";
  messageId: string;
  data: {
    action: string;
    payload: any;
  };
}

interface PWAResponseMessage extends MessageSource {
  action: "pwaResponse";
  messageId: string;
  data: any;
}

interface PWAMessage extends MessageSource {
  messageId: string;
  action: string;
  urls?: string[];
  [key: string]: any;
}

interface ContentExtensionMessage extends MessageSource {
  messageId: string;
  action?: string;
  success?: boolean;
  resources?: any[];
  error?: string;
  [key: string]: any;
}

// Function to collect current page data
function collectPageData() {
  return {
    url: window.location.href,
    html: document.documentElement.outerHTML,
    title: document.title,
  };
}

// Check if we're in the PWA and if we're in the extension popup window
const isPWA = window.location.origin === "http://localhost:8081";
const isExtensionPopup = isPWA && new URLSearchParams(window.location.search).has("ext");

// If we're in the extension popup window, handle direct communication
if (isExtensionPopup) {
  console.log("SAVR Extension Content: Running in PWA popup window");

  // Get the message ID from the URL
  const messageId = new URLSearchParams(window.location.search).get("messageId");

  // Listen for messages from the extension
  window.addEventListener("message", (event) => {
    // Ensure message is from our extension
    const eventData = event.data;
    if (!eventData || eventData.source !== "SAVR_EXTENSION") {
      return;
    }

    console.log("SAVR Extension Content: Received message in popup:", eventData);

    // Forward message to main PWA window
    window.opener.postMessage(eventData, "*");

    // Listen for response from main PWA window
    const responseHandler = (responseEvent: MessageEvent) => {
      const responseData = responseEvent.data;
      if (responseData && responseData.messageId === messageId) {
        window.removeEventListener("message", responseHandler);

        // Send response back to extension
        event.source?.postMessage(responseData, { targetOrigin: "*" });
      }
    };

    window.addEventListener("message", responseHandler);
  });
}

// If we're in the main PWA window, handle communication with extension popup
if (isPWA && !isExtensionPopup) {
  console.log("SAVR Extension Content: Running in main PWA window");

  // Listen for messages from extension popup
  window.addEventListener("message", (event: MessageEvent) => {
    // Ensure message is from our extension popup
    const eventData = event.data as PWAMessage;
    if (!eventData || eventData.source !== "SAVR_EXTENSION") {
      return;
    }

    console.log("SAVR Extension Content: Received message from extension popup:", eventData);

    const { action, messageId, payload } = eventData;

    if (action === "saveHtml" && payload) {
      // Forward saveHtml message to PWA
      window.postMessage(
        {
          source: "SAVR_EXTENSION",
          messageId,
          action,
          payload,
        },
        "*"
      );
    } else if (action === "fetchResources" && payload?.urls) {
      // Forward fetchResources message to PWA
      window.postMessage(
        {
          source: "SAVR_EXTENSION",
          messageId,
          action,
          urls: payload.urls,
        },
        "*"
      );
    }

    // Listen for response from PWA
    const responseHandler = (responseEvent: MessageEvent) => {
      const responseData = responseEvent.data;
      if (responseData && responseData.messageId === messageId) {
        window.removeEventListener("message", responseHandler);

        // Forward response back to extension popup
        if (event.source) {
          (event.source as Window).postMessage(responseData, "*");
        }
      }
    };

    window.addEventListener("message", responseHandler);
  });
}

// Handle messages from background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("SAVR Extension Content: Received message:", message, "from sender:", sender);

  if (message.action === "getPageData" || message.action === "saveCurrentPage") {
    // Collect page data and send it back
    const html = document.documentElement.outerHTML;
    console.log("SAVR Extension Content: Collected page HTML, length:", html.length);

    sendResponse({
      action: "getPageData",
      success: true,
      html: html,
      title: document.title,
    });
    return true;
  } else if (message.action === "forwardToPWA" && isPWA) {
    console.log("SAVR Extension Content: Forwarding message to PWA:", message.data);

    // Forward the message to the PWA
    window.postMessage(
      {
        source: "SAVR_EXTENSION",
        messageId: message.messageId,
        action: message.data.action,
        payload: message.data.payload,
      },
      "*"
    );

    // Set up listener for response from PWA
    const responseHandler = (event: MessageEvent) => {
      // Check if the message is from our PWA
      const eventData = event.data as PWAMessage;
      if (event.source !== window || !eventData || eventData.source !== "SAVR_PWA") {
        return;
      }

      // Check if this is a response to our message
      if (eventData.messageId === message.messageId) {
        console.log("SAVR Extension Content: Received response from PWA:", eventData);
        // Remove listener to avoid memory leaks
        window.removeEventListener("message", responseHandler);
        // Send response back to background script
        sendResponse(eventData);
      }
    };

    window.addEventListener("message", responseHandler);
    return true; // Keep the message channel open for async response
  }
});

// If we're in the PWA, set up message handling for extension communication
if (isPWA) {
  console.log("SAVR Extension Content: Running in PWA environment, setting up message listener");

  // Listen for messages from the PWA to the extension
  window.addEventListener("message", (event: MessageEvent) => {
    // Ensure the message is from our PWA
    const eventData = event.data as PWAMessage;
    if (event.source !== window || !eventData || eventData.source !== "SAVR_PWA") {
      return;
    }

    console.log("SAVR Extension Content: Received message from PWA:", eventData);

    const { action, urls, messageId } = eventData;

    if (action === "fetchResources" && urls) {
      console.log("SAVR Extension Content: Forwarding fetchResources request to background:", urls);
      // Forward request to background script
      chrome.runtime.sendMessage({ action: "fetchResources", urls }, (response) => {
        console.log(
          "SAVR Extension Content: Received response from background for fetchResources:",
          response
        );
        // Send response back to PWA
        window.postMessage(
          {
            source: "SAVR_EXTENSION",
            messageId,
            success: response.success,
            resources: response.data?.resources,
            error: response.error,
          },
          "*"
        );
      });
    }
  });
}
