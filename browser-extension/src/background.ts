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
}

type BackgroundExtensionMessage = FetchResourcesMessage | SaveCurrentPageMessage;

// Constants
const PWA_ORIGIN = "http://localhost:8081";

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener(
  (message: BackgroundExtensionMessage, sender, sendResponse) => {
    console.log('SAVR Extension Background: Received message:', message, 'from sender:', sender);
    if (message.action === "saveCurrentPage") {
      console.log('SAVR Extension Background: Handling saveCurrentPage action');
      saveCurrentPage(sendResponse);
      return true; // Keep the message channel open for async response
    } else if (message.action === "fetchResources" && "urls" in message) {
      console.log('SAVR Extension Background: Handling fetchResources action for URLs:', message.urls);
      fetchResources(message.urls, sendResponse);
      return true; // Keep the message channel open for async response
    }
  }
);

// Function to save the current page
async function saveCurrentPage(sendResponse: (response: MessageResponse) => void): Promise<void> {
  console.log('SAVR Extension Background: saveCurrentPage function called');
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab.id) {
      console.error('SAVR Extension Background: No active tab found');
      throw new Error("No active tab found");
    }

    console.log('SAVR Extension Background: Active tab found:', activeTab);

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
      console.error('SAVR Extension Background: Failed to get page content');
      throw new Error("Failed to get page content");
    }

    const pageData = results[0].result;
    console.log('SAVR Extension Background: Page data extracted:', pageData);

    if (pageData == undefined) {
      console.error('SAVR Extension Background: pageData is undefined');
      sendResponse({
        success: false,
        // error: "pageData undefined",
        data: "pageData undefined",
      });
    }

    console.log('SAVR Extension Background: Sending saveHtml message to PWA');
    // Send the HTML to the PWA
    const response = await sendToPWA("saveHtml", {
      url: pageData.url,
      html: pageData.html,
      title: pageData.title,
    });

    console.log('SAVR Extension Background: Response from PWA for saveHtml:', response);
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
  console.log('SAVR Extension Background: fetchResources function called for URLs:', urls);
  try {
    const resources: Resource[] = await Promise.all(
      urls.map(async (url: string): Promise<Resource> => {
        try {
          console.log('SAVR Extension Background: Fetching resource:', url);
          const response = await fetch(url);
          const blob = await response.blob();

          // Convert blob to base64
          return new Promise<Resource>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              console.log('SAVR Extension Background: Resource fetched and converted to base64:', url);
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
          console.error('SAVR Extension Background: Failed to fetch resource:', url, error);
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : "Failed to fetch resource",
          };
        }
      })
    );

    console.log('SAVR Extension Background: All resources fetched, sending response to PWA');
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
  console.log('SAVR Extension Background: sendToPWA function called with action:', action, 'and data:', data);
  // Create a communication channel with the PWA
  const targetOrigin = PWA_ORIGIN;

  return new Promise((resolve, reject) => {
    // Create a unique ID for this message
    const messageId = Date.now().toString();

    // Check if we already have a tab with the PWA open
    chrome.tabs.query({ url: `${targetOrigin}/*` }, (tabs) => {
      console.log('SAVR Extension Background: Checking for PWA tab, found:', tabs.length);
      if (tabs.length > 0) {
        // We already have a tab with the PWA open, use it
        const tab = tabs[0];
        
        if (!tab.id) {
          console.error('SAVR Extension Background: Tab ID not found for PWA tab');
          reject(new Error("Tab ID not found"));
          return;
        }

        console.log('SAVR Extension Background: PWA tab found, sending message to tab ID:', tab.id);

        // Set up listener for response
        const listener = function (event: MessageEvent): void {
          if (event.origin !== targetOrigin) return;

          try {
            const response = event.data;
            console.log('SAVR Extension Background: Received message from PWA tab:', response);

            // Check if this is the response to our message
            if (response.messageId === messageId) {
              console.log('SAVR Extension Background: Received response for message ID:', messageId);
              window.removeEventListener("message", listener);

              if (response.error) {
                console.error('SAVR Extension Background: Error in PWA response:', response.error);
                reject(new Error(response.error));
              } else {
                console.log('SAVR Extension Background: PWA response successful:', response.data);
                resolve(response.data);
              }
            }
          } catch (error) {
            console.error("SAVR Extension Background: Error processing PWA response:", error);
          }
        };

        window.addEventListener("message", listener);

        // Send message to the tab
        chrome.tabs.sendMessage(tab.id, {
          action: "forwardToPWA",
          messageId,
          data: {
            action,
            payload: data,
          },
        });

        // Set timeout for response
        setTimeout(() => {
          console.error('SAVR Extension Background: Communication with PWA tab timed out for message ID:', messageId);
          window.removeEventListener("message", listener);
          reject(new Error("Communication with PWA timed out"));
        }, 30000); // 30-second timeout
      } else {
        console.log('SAVR Extension Background: No PWA tab found, creating hidden iframe');
        // No tab with the PWA open, create a hidden iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `${targetOrigin}?ext=true&hidden=true`;
        
        // Set up listener for response
        const listener = function (event: MessageEvent): void {
          if (event.origin !== targetOrigin) return;

          try {
            const response = event.data;
            console.log('SAVR Extension Background: Received message from PWA iframe:', response);

            // Check if this is the response to our message
            if (response.messageId === messageId) {
              console.log('SAVR Extension Background: Received response for message ID:', messageId);
              window.removeEventListener("message", listener);
              document.body.removeChild(iframe);

              if (response.error) {
                console.error('SAVR Extension Background: Error in PWA iframe response:', response.error);
                reject(new Error(response.error));
              } else {
                console.log('SAVR Extension Background: PWA iframe response successful:', response.data);
                resolve(response.data);
              }
            }
          } catch (error) {
            console.error("SAVR Extension Background: Error processing PWA iframe response:", error);
          }
        };

        window.addEventListener("message", listener);

        // Wait for iframe to load
        iframe.onload = () => {
          console.log('SAVR Extension Background: PWA iframe loaded, sending message');
          // Send message to the iframe
          iframe.contentWindow?.postMessage({
            source: "SAVR_EXTENSION",
            messageId,
            action,
            payload: data,
          }, targetOrigin);
        };

        // Add iframe to the page
        document.body.appendChild(iframe);

        // Set timeout for response
        setTimeout(() => {
          console.error('SAVR Extension Background: Communication with PWA iframe timed out for message ID:', messageId);
          window.removeEventListener("message", listener);
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(new Error("Communication with PWA timed out"));
        }, 30000); // 30-second timeout
      }
    });
  });
}
