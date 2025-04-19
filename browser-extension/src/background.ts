// Type definitions
interface PageData {
  url: string;
  html: string;
  title: string;
}

interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface Resource {
  url: string;
  data?: string; // base64 encoded data
  type?: string; // MIME type
  success: boolean;
  error?: string;
}

interface FetchResourcesMessage {
  action: "fetchResources";
  urls: string[];
}

interface SaveCurrentPageMessage {
  action: "saveCurrentPage";
}

type ExtensionMessage = FetchResourcesMessage | SaveCurrentPageMessage;

// Constants
const PWA_ORIGIN = "https://savr.pages.dev";

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.action === "saveCurrentPage") {
    saveCurrentPage(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (message.action === "fetchResources" && "urls" in message) {
    fetchResources(message.urls, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

// Function to save the current page
async function saveCurrentPage(sendResponse: (response: MessageResponse) => void): Promise<void> {
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab.id) {
      throw new Error("No active tab found");
    }

    // Get the HTML content using scripting API
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (): PageData => {
        return {
          url: window.location.href,
          html: document.documentElement.outerHTML,
          title: document.title,
        };
      },
    });

    if (!results || results.length === 0) {
      throw new Error("Failed to get page content");
    }

    const pageData = results[0].result;

    // Send the HTML to the PWA
    const response = await sendToPWA("saveHtml", {
      url: pageData.url,
      html: pageData.html,
      title: pageData.title,
    });

    sendResponse({ success: true, data: response });
  } catch (error) {
    console.error("Error saving page:", error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Function to fetch resources (images) requested by the PWA
async function fetchResources(
  urls: string[],
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    const resources: Resource[] = await Promise.all(
      urls.map(async (url: string): Promise<Resource> => {
        try {
          const response = await fetch(url);
          const blob = await response.blob();

          // Convert blob to base64
          return new Promise<Resource>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve({
                url,
                data: reader.result as string,
                type: blob.type,
                success: true,
              });
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch resource",
          };
        }
      })
    );

    sendResponse({ success: true, data: { resources } });
  } catch (error) {
    console.error("Error fetching resources:", error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Function to communicate with the PWA
async function sendToPWA(action: string, data: any): Promise<any> {
  // Create a communication channel with the PWA
  const targetOrigin = PWA_ORIGIN;

  return new Promise((resolve, reject) => {
    // Create a unique ID for this message
    const messageId = Date.now().toString();

    // Set up listener for response
    const listener = function (event: MessageEvent): void {
      if (event.origin !== targetOrigin) return;

      try {
        const response = event.data;

        // Check if this is the response to our message
        if (response.messageId === messageId) {
          window.removeEventListener("message", listener);

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        }
      } catch (error) {
        console.error("Error processing PWA response:", error);
      }
    };

    window.addEventListener("message", listener);

    // Open the PWA in a new tab if not already open
    chrome.tabs.create({ url: `${targetOrigin}?ext=true` }, (tab) => {
      if (!tab.id) {
        window.removeEventListener("message", listener);
        reject(new Error("Failed to create tab"));
        return;
      }

      // Wait for tab to fully load
      const tabUpdateListener = function (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ): void {
        if (tabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);

          // Send message to the tab
          chrome.tabs.sendMessage(tabId, {
            action: "forwardToPWA",
            messageId,
            data: {
              action,
              payload: data,
            },
          });
        }
      };

      chrome.tabs.onUpdated.addListener(tabUpdateListener);
    });

    // Set timeout for response
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("Communication with PWA timed out"));
    }, 30000); // 30-second timeout
  });
}
