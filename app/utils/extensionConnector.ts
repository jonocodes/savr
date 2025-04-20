// This file was moved from the browser-extension project (pwa-part.ts)

// Extension communication module for SAVR PWA
// Add this to your PWA code

// Interface definitions
interface PWAMessage {
  source: string;
  messageId: string;
  action: string;
  payload?: any;
  success?: boolean;
  error?: string;
}

interface ExtensionMessage {
  source: string;
  messageId: string;
  action?: string;
  payload?: any;
  success?: boolean;
  resources?: ResourceResponse[];
  error?: string;
}

interface PageData {
  url: string;
  html: string;
  title: string;
}

interface ResourceResponse {
  url: string;
  data?: string;
  type?: string;
  success: boolean;
  error?: string;
}

interface ResourceRequest {
  url: string;
  data: string;
  mimeType: string;
  savedAt: string;
}

interface PageRequest {
  url: string;
  title: string;
  html: string;
  savedAt: string;
}

interface Storage {
  pages: {
    save: (data: PageRequest) => Promise<void>;
  };
  resources: {
    save: (data: ResourceRequest) => Promise<void>;
  };
}

class ExtensionConnector {
  private isExtensionAvailable: boolean = false;
  private pendingResourceRequests: Record<string, string> = {};

  constructor() {
    debugger;
    this.initializeListener();
    this.checkExtensionPresence();
  }

  // Set up the message listener for extension communications
  private initializeListener(): void {
    window.addEventListener("message", this.handleExtensionMessage.bind(this));
  }

  // Check if the extension is available
  private checkExtensionPresence(): void {
    // Send a ping to see if the extension is active
    window.postMessage(
      {
        source: "SAVR_PWA",
        action: "ping",
        messageId: "ping-" + Date.now(),
      },
      "*"
    );

    // Set a timeout to check for response
    setTimeout(() => {
      if (!this.isExtensionAvailable) {
        console.log("SAVR Extension not detected");
      }
    }, 500);
  }

  // Handle incoming messages from the extension
  private handleExtensionMessage(event: MessageEvent): void {
    // Check if the message is from our extension
    const eventData = event.data as ExtensionMessage;
    if (event.source !== window || !eventData || eventData.source !== "SAVR_EXTENSION") {
      return;
    }

    // Mark the extension as available
    this.isExtensionAvailable = true;

    const { action, messageId, payload, success, resources, error } = eventData;

    // Handle different message types
    if (action === "saveHtml" && payload) {
      this.handleSaveHtml(messageId, payload);
    } else if (success !== undefined && resources) {
      // This is a response to our fetchResources request
      this.handleResourcesResponse(messageId, success, resources, error);
    } else if (action === "ping") {
      // Respond to ping
      window.postMessage(
        {
          source: "SAVR_PWA",
          messageId,
          action: "pong",
          success: true,
        },
        "*"
      );
    }
  }

  // Handle saving HTML received from the extension
  private async handleSaveHtml(messageId: string, payload: PageData): Promise<void> {
    try {
      const { url, html, title } = payload;

      // Clean HTML - this function should be implemented according to your needs
      const cleanHtml = this.cleanHtml(html);

      // Save the HTML to IndexedDB using your existing storage mechanism
      await this.saveToIndexedDB(url, cleanHtml, title);

      // Extract image URLs from the cleaned HTML
      const imageUrls = this.extractImageUrls(cleanHtml, url);

      // Request images from the extension if there are any
      if (imageUrls.length > 0) {
        this.fetchResources(imageUrls, messageId);
      } else {
        // No images to fetch, send success response
        window.postMessage(
          {
            source: "SAVR_PWA",
            messageId,
            success: true,
            data: { message: "Page saved successfully without images" },
          },
          "*"
        );
      }
    } catch (error) {
      console.error("Error handling HTML save:", error);
      window.postMessage(
        {
          source: "SAVR_PWA",
          messageId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "*"
      );
    }
  }

  // Request resources (images) from the extension
  private fetchResources(urls: string[], originalMessageId: string): void {
    const resourceMessageId = "resources-" + Date.now();

    // Store the original message ID for callback
    this.pendingResourceRequests[resourceMessageId] = originalMessageId;

    // Request resources from the extension
    window.postMessage(
      {
        source: "SAVR_PWA",
        messageId: resourceMessageId,
        action: "fetchResources",
        urls,
      },
      "*"
    );
  }

  // Handle response with fetched resources
  private async handleResourcesResponse(
    messageId: string,
    success: boolean,
    resources: ResourceResponse[],
    error?: string
  ): Promise<void> {
    try {
      // Find the original message ID
      const originalMessageId = this.pendingResourceRequests[messageId];

      // Remove from pending requests regardless of success
      delete this.pendingResourceRequests[messageId];

      if (!originalMessageId) {
        console.warn(
          "SAVR Extension PWA: Original message ID not found for resource response:",
          messageId
        );
        // If original message ID is not found, we can't send a response back.
        return;
      }

      if (!success) {
        console.error("SAVR Extension PWA: Failed to fetch resources:", error);
        window.postMessage(
          {
            source: "SAVR_PWA",
            messageId: originalMessageId,
            success: false,
            error: error || "Failed to fetch resources",
          },
          "*"
        );
        return;
      }

      // Process and save received resources
      for (const resource of resources) {
        if (resource.success && resource.data) {
          console.log("SAVR Extension PWA: Saving fetched resource:", resource.url);
          await this.saveResourceToIndexedDB(
            resource.url,
            resource.data,
            resource.type || "image/jpeg"
          );
        } else {
          console.warn(
            "SAVR Extension PWA: Failed to save individual resource:",
            resource.url,
            resource.error
          );
        }
      }

      console.log(
        "SAVR Extension PWA: All resources processed, sending final response to original message ID:",
        originalMessageId
      );
      // Send final success response to the original request
      window.postMessage(
        {
          source: "SAVR_PWA",
          messageId: originalMessageId,
          success: true,
          data: {
            message: "Page and resources saved successfully",
            savedResources: resources.filter((r) => r.success).length,
            failedResources: resources.filter((r) => !r.success).length,
          },
        },
        "*"
      );
    } catch (error) {
      console.error("SAVR Extension PWA: Error handling resources response:", error);

      // Attempt to send error response to the original request if available
      const originalMessageId = this.pendingResourceRequests[messageId]; // Re-check in case of error before deletion
      if (originalMessageId) {
        window.postMessage(
          {
            source: "SAVR_PWA",
            messageId: originalMessageId,
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error during resource handling",
          },
          "*"
        );
      }
    }
  }

  // Utility function to clean HTML
  private cleanHtml(html: string): string {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Remove scripts
    const scripts = doc.querySelectorAll("script");
    scripts.forEach((script) => script.remove());

    // Remove inline event handlers
    const allElements = doc.querySelectorAll("*");
    allElements.forEach((el) => {
      const attributes = el.attributes;
      for (let i = attributes.length - 1; i >= 0; i--) {
        const attrName = attributes[i].name;
        if (attrName.startsWith("on")) {
          el.removeAttribute(attrName);
        }
      }
    });

    // Serialize back to string
    return new XMLSerializer().serializeToString(doc);
  }

  // Utility function to extract image URLs from HTML
  private extractImageUrls(html: string, baseUrl: string): string[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Get all image elements
    const images = doc.querySelectorAll("img");
    const imageUrls: string[] = [];

    images.forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        // Convert relative URLs to absolute
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          imageUrls.push(absoluteUrl);
        } catch (e) {
          console.warn("Invalid URL:", src);
        }
      }
    });

    // Get background images from inline styles (simplified)
    const elementsWithStyle = doc.querySelectorAll('[style*="background"]');
    elementsWithStyle.forEach((el) => {
      const style = el.getAttribute("style");
      const urlMatch = style?.match(/url\(['"]?([^'"()]+)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        try {
          const absoluteUrl = new URL(urlMatch[1], baseUrl).href;
          imageUrls.push(absoluteUrl);
        } catch (e) {
          console.warn("Invalid URL in style:", urlMatch[1]);
        }
      }
    });

    return [...new Set(imageUrls)]; // Remove duplicates
  }

  // These methods should be implemented according to your storage approach
  private async saveToIndexedDB(url: string, html: string, title: string): Promise<void> {
    // Implementation depends on your IndexedDB setup
    console.log(`Saving HTML for ${url} with title: ${title}`);

    // This is a placeholder - replace with your actual implementation
    const storage = await this.getStorage();
    await storage.pages.save({
      url,
      title,
      html,
      savedAt: new Date().toISOString(),
    });
  }

  private async saveResourceToIndexedDB(
    url: string,
    dataUrl: string,
    mimeType: string
  ): Promise<void> {
    // Implementation depends on your IndexedDB setup
    console.log(`Saving resource: ${url}`);

    // This is a placeholder - replace with your actual implementation
    const storage = await this.getStorage();
    await storage.resources.save({
      url,
      data: dataUrl,
      mimeType,
      savedAt: new Date().toISOString(),
    });
  }

  // Helper method to get storage reference - replace with your actual implementation
  private async getStorage(): Promise<Storage> {
    // This is a placeholder - replace with your actual storage implementation
    return {
      pages: {
        save: async (data: PageRequest): Promise<void> => {
          // Your actual implementation using remoteStorage.js
          console.log("Would save page:", data);
        },
      },
      resources: {
        save: async (data: ResourceRequest): Promise<void> => {
          // Your actual implementation using remoteStorage.js
          console.log("Would save resource:", data);
        },
      },
    };
  }

  // Public method to check if extension is available
  public isAvailable(): boolean {
    return this.isExtensionAvailable;
  }
}

// Initialize the connector when the PWA loads
const extensionConnector = new ExtensionConnector();

// Export for use in your application
export default extensionConnector;
