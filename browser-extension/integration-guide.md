# Integrating with remoteStorage.js

This guide explains how to adapt the SAVR extension to work with your existing remoteStorage.js implementation in your PWA.

## Understanding the Flow

1. The browser extension captures HTML from pages the user wants to save
2. The PWA processes this HTML, removes scripts, and stores it using remoteStorage.js
3. The PWA extracts image URLs and requests them from the extension
4. The extension fetches these resources and returns them to the PWA
5. The PWA stores these resources using remoteStorage.js

## Required Modifications

### 1. Update the Storage Implementation

Replace the placeholder storage methods in `ExtensionConnector` with your actual remoteStorage.js implementation:

```typescript
private async getStorage(): Promise<Storage> {
  // Get your remoteStorage instance
  const remoteStorage = window.remoteStorage; // Or however you access it

  return {
    pages: {
      save: async (data: PageRequest): Promise<void> => {
        // Save page to remoteStorage
        await remoteStorage.pages.storeHTML(data.url, {
          title: data.title,
          html: data.html,
          savedAt: data.savedAt
        });
      }
    },
    resources: {
      save: async (data: ResourceRequest): Promise<void> => {
        // Save resource to remoteStorage
        await remoteStorage.resources.storeResource(data.url, {
          data: data.data,
          mimeType: data.mimeType,
          savedAt: data.savedAt
        });
      }
    }
  };
}
```

### 2. Creating the remoteStorage Module

If you don't already have a remoteStorage module for pages and resources, you'll need to create one:

```typescript
// Example remoteStorage module implementation
remoteStorage.defineModule("pages", function (privateClient, publicClient) {
  return {
    exports: {
      storeHTML: function (url, data) {
        // Use URL as a safe document ID by encoding it
        const docId = encodeURIComponent(url);
        return privateClient.storeObject("page", docId, data);
      },
      getHTML: function (url) {
        // Get page by URL
        const docId = encodeURIComponent(url);
        return privateClient.getObject(docId);
      },
      listPages: function () {
        // List all saved pages
        return privateClient.getAll("");
      },
    },
  };
});

remoteStorage.defineModule("resources", function (privateClient, publicClient) {
  return {
    exports: {
      storeResource: function (url, data) {
        // Use URL as a safe document ID by encoding it
        const docId = encodeURIComponent(url);
        return privateClient.storeObject("resource", docId, data);
      },
      getResource: function (url) {
        // Get resource by URL
        const docId = encodeURIComponent(url);
        return privateClient.getObject(docId);
      },
    },
  };
});

// Claim modules
remoteStorage.access.claim("pages", "rw");
remoteStorage.access.claim("resources", "rw");
```

### 3. Initialize RemoteStorage in Your PWA

Make sure remoteStorage is properly initialized before the ExtensionConnector tries to use it:

```typescript
// Initialize remoteStorage
const remoteStorage = new RemoteStorage({
  logging: true,
  modules: ["pages", "resources"],
});

// Initialize the widget if you're using it
const widget = new RemoteStorageWidget(remoteStorage);
widget.attach();

// Connect the extension after remoteStorage is ready
remoteStorage.on("ready", () => {
  // Now initialize the extension connector
  const extensionConnector = new ExtensionConnector();
  window.extensionConnector = extensionConnector;
});
```

### 4. Handle Large Data Efficiently

When dealing with images and HTML, you might store large amounts of data. Consider:

```typescript
// Configure remoteStorage client for larger files
privateClient.use("", {
  maxAge: 86400 * 30, // 30 days cache
});

// For very large files, you might need to adjust caching strategy
privateClient.cache("", false);
```

### 5. Create a PWA UI to View Saved Pages

Add a UI in your PWA to view and manage saved pages:

```typescript
async function loadSavedPages() {
  const pages = await remoteStorage.pages.listPages();

  const pageList = document.getElementById("saved-pages-list");
  pageList.innerHTML = "";

  for (const [id, page] of Object.entries(pages)) {
    if (page.title && page.savedAt) {
      const li = document.createElement("li");

      const link = document.createElement("a");
      link.href = `/view?id=${encodeURIComponent(id)}`;
      link.textContent = page.title;

      const date = document.createElement("span");
      date.textContent = new Date(page.savedAt).toLocaleDateString();

      li.appendChild(link);
      li.appendChild(document.createTextNode(" - "));
      li.appendChild(date);

      pageList.appendChild(li);
    }
  }
}
```

## Handling CORS in the PWA

Even though the extension handles CORS issues for saving, your PWA might still need to handle CORS when displaying the saved content:

```typescript
// In your page display logic
function renderSavedPage(pageData) {
  const container = document.getElementById("page-content");

  // Create a sandboxed iframe to display the content safely
  const iframe = document.createElement("iframe");
  iframe.sandbox = "allow-same-origin";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";

  container.appendChild(iframe);

  // Write the HTML content to the iframe
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(pageData.html);
  doc.close();

  // Process all img tags to use local resources
  const images = doc.querySelectorAll("img");
  images.forEach(async (img) => {
    const originalSrc = img.getAttribute("src");
    if (originalSrc) {
      try {
        // Try to get the resource from storage
        const resource = await remoteStorage.resources.getResource(originalSrc);
        if (resource && resource.data) {
          img.src = resource.data; // Data URL from storage
        }
      } catch (error) {
        console.warn("Failed to load image:", originalSrc, error);
      }
    }
  });
}
```

## Testing the Integration

1. Ensure your PWA is running at `https://savr.pages.dev` (or update the `PWA_ORIGIN` in the extension)
2. Load the extension in your browser
3. Navigate to a web page you want to save
4. Click the extension button and then "Save This Page"
5. Open your PWA in a tab and verify that the page was saved
6. Check the browser console for any errors or warnings

## Troubleshooting

- **Extension doesn't communicate with PWA**: Check that the origins match exactly. The `PWA_ORIGIN` in the extension must match the origin of your PWA.
- **Images not saving**: Verify the resource URLs are correctly extracted and that the data URLs are properly saved in remoteStorage.
- **Storage errors**: Check remoteStorage connection status and ensure you have the correct permissions.
