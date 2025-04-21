/// <reference types="chrome" />

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
  pageData?: PageData;
}

interface GetPageDataMessage {
  action: "getPageData";
}

type BackgroundExtensionMessage =
  | FetchResourcesMessage
  | SaveCurrentPageMessage
  | GetPageDataMessage;

// Constants
const PWA_ORIGIN = "http://localhost:8081";
const EXTENSION_ID = chrome.runtime.id;

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener(
  (message: BackgroundExtensionMessage, sender, sendResponse) => {
    console.log("SAVR Extension Background: Received message:", message, "from sender:", sender);

    if (message.action === "getPageData") {
      console.log("SAVR Extension Background: Handling getPageData request");
      // Forward to content script of sender
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, { action: "getPageData" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          if (response && response.success) {
            sendResponse({
              success: true,
              pageData: {
                url: sender.tab?.url || "",
                html: response.html,
                title: response.title,
              },
            });
          } else {
            console.error(response);
            sendResponse({
              success: false,
              error: "Failed to get page data",
            });
          }
        });
        return true;
      }
      sendResponse({
        success: false,
        error: "No valid tab found",
      });
      return true;
    } else if (message.action === "saveCurrentPage") {
      console.log("SAVR Extension Background: Handling saveCurrentPage action");
      if (message.pageData) {
        saveCurrentPage(message.pageData, sendResponse);
        return true;
      }
      // If no page data, send it back as an error
      sendResponse({
        success: false,
        error: "No page data provided",
      });
      return true;
    } else if (message.action === "fetchResources" && "urls" in message) {
      console.log(
        "SAVR Extension Background: Handling fetchResources action for URLs:",
        message.urls
      );
      fetchResources(message.urls, sendResponse);
      return true; // Keep the message channel open for async response
    }
  }
);

// Function to save the current page
async function saveCurrentPage(
  pageData: PageData,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  console.log("SAVR Extension Background: saveCurrentPage function called");
  try {
    if (!pageData) {
      console.error("SAVR Extension Background: pageData is undefined");
      sendResponse({
        success: false,
        error: "Page data is undefined",
      });
      return;
    }

    console.log("SAVR Extension Background: Sending saveHtml message to PWA");
    // Send the HTML to the PWA
    const response = await sendToPWA("saveHtml", {
      url: pageData.url,
      html: pageData.html,
      title: pageData.title,
    });

    console.log("SAVR Extension Background: Response from PWA for saveHtml:", response);
    sendResponse({ success: true, data: response });
  } catch (error) {
    console.error("SAVR Extension Background: Error saving page:", error);
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
  console.log("SAVR Extension Background: fetchResources function called for URLs:", urls);
  try {
    const resources: Resource[] = await Promise.all(
      urls.map(async (url: string): Promise<Resource> => {
        try {
          console.log("SAVR Extension Background: Fetching resource:", url);
          const response = await fetch(url);
          const blob = await response.blob();

          // Convert blob to base64
          return new Promise<Resource>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              console.log(
                "SAVR Extension Background: Resource fetched and converted to base64:",
                url
              );
              resolve({
                url,
                data: reader.result as string,
                type: blob.type,
                success: true,
              });
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error("SAVR Extension Background: Failed to fetch resource:", url, error);
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch resource",
          };
        }
      })
    );

    console.log("SAVR Extension Background: All resources fetched, sending response to PWA");
    sendResponse({ success: true, data: { resources } });
  } catch (error) {
    console.error("SAVR Extension Background: Error fetching resources:", error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Function to communicate with the PWA
async function sendToPWA(action: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const messageId = Date.now().toString();
    let pwaWindow: Window | null = null;

    // Create a small popup window for the PWA
    const width = 10;
    const height = 10;
    const left = screen.width - width;
    const top = screen.height - height;

    pwaWindow = window.open(
      `${PWA_ORIGIN}?ext=true&messageId=${messageId}`,
      "savrPWA",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!pwaWindow) {
      reject(new Error("Could not open PWA window. Please allow popups for this extension."));
      return;
    }

    // Listen for response from PWA
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== PWA_ORIGIN) return;

      const response = event.data;
      if (response && response.messageId === messageId) {
        window.removeEventListener("message", messageHandler);

        // Close the popup
        if (pwaWindow) {
          pwaWindow.close();
        }

        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.data);
        }
      }
    };

    window.addEventListener("message", messageHandler);

    // Send message to PWA
    setTimeout(() => {
      if (pwaWindow) {
        pwaWindow.postMessage(
          {
            source: "SAVR_EXTENSION",
            messageId,
            action,
            payload: data,
          },
          PWA_ORIGIN
        );
      }
    }, 1000); // Give the window time to load

    // Set timeout
    setTimeout(() => {
      window.removeEventListener("message", messageHandler);
      if (pwaWindow) {
        pwaWindow.close();
      }
      reject(new Error("Communication with PWA timed out"));
    }, 10000);
  });
}
