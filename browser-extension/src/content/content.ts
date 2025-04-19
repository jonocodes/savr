// Type definitions
interface ForwardToPWAMessage {
  action: "forwardToPWA";
  messageId: string;
  data: {
    action: string;
    payload: any;
  };
}

interface PWAResponseMessage {
  action: "pwaResponse";
  messageId: string;
  data: any;
}

interface PWAMessage {
  source: "SAVR_PWA";
  messageId: string;
  action: string;
  urls?: string[];
  [key: string]: any;
}

interface ExtensionMessage {
  source: "SAVR_EXTENSION";
  messageId: string;
  action?: string;
  success?: boolean;
  resources?: any[];
  error?: string;
  [key: string]: any;
}

// Check if we're in the PWA or on a regular page
const isPWA = window.location.origin === "https://savr.pages.dev";

// Handle messages from background script
chrome.runtime.onMessage.addListener((message: ForwardToPWAMessage, sender, sendResponse) => {
  if (message.action === "forwardToPWA" && isPWA) {
    // We're in the PWA, forward the message
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
    const responseHandler = (event: MessageEvent): void => {
      // Check if the message is from our PWA
      const eventData = event.data as PWAMessage;
      if (event.source !== window || !eventData || eventData.source !== "SAVR_PWA") {
        return;
      }

      // Check if this is a response to our message
      if (eventData.messageId === message.messageId) {
        // Remove listener to avoid memory leaks
        window.removeEventListener("message", responseHandler);

        // Send response back to background script
        chrome.runtime.sendMessage({
          action: "pwaResponse",
          messageId: message.messageId,
          data: eventData,
        });
      }
    };

    window.addEventListener("message", responseHandler);
    return true;
  }
});

// If we're in the PWA, set up message handling for extension communication
if (isPWA) {
  // Listen for messages from the PWA to the extension
  window.addEventListener("message", (event: MessageEvent) => {
    // Ensure the message is from our PWA
    const eventData = event.data as PWAMessage;
    if (event.source !== window || !eventData || eventData.source !== "SAVR_PWA") {
      return;
    }

    const { action, urls, messageId } = eventData;

    if (action === "fetchResources" && urls) {
      // Forward request to background script
      chrome.runtime.sendMessage({ action: "fetchResources", urls }, (response) => {
        // Send response back to PWA
        const message: ExtensionMessage = {
          source: "SAVR_EXTENSION",
          messageId,
          success: response.success,
          resources: response.data?.resources,
          error: response.error,
        };
        window.postMessage(message, "*");
      });
    }
  });
}
