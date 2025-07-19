# Bookmarklet Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant ArticlePage as Article Page (e.g., news site)
    participant Bookmarklet as Bookmarklet Script
    participant SAVRPWA as SAVR PWA
    participant Resources as External Resources (images, CSS)

    Note over User, Resources: PHASE 1: Initialization
    User->>ArticlePage: Clicks bookmarklet
    ArticlePage->>Bookmarklet: Executes bookmarklet script
    Bookmarklet->>SAVRPWA: Opens new window (localhost:3000)
    SAVRPWA-->>Bookmarklet: Window opened

    Note over User, Resources: PHASE 2: Page Capture & Cleaning
    Bookmarklet->>ArticlePage: Clones document.documentElement
    Bookmarklet->>Bookmarklet: Removes all <script> tags
    Bookmarklet->>Bookmarklet: Removes event handlers (onclick, onload, etc.)
    Bookmarklet->>Resources: Fetches external CSS files
    Resources-->>Bookmarklet: CSS content
    Bookmarklet->>Bookmarklet: Inlines CSS into <style> tag
    Bookmarklet->>Bookmarklet: Removes original <link> tags
    Bookmarklet->>Bookmarklet: Creates cleaned HTML string

    Note over User, Resources: PHASE 3: PWA Communication Setup
    Bookmarklet->>Bookmarklet: Sets up message listener for 'savr-ready'
    SAVRPWA->>SAVRPWA: Initializes and loads
    SAVRPWA->>Bookmarklet: Sends 'savr-ready' message
    Bookmarklet->>SAVRPWA: Sends {url, html} data

    Note over User, Resources: PHASE 4: Resource Processing
    SAVRPWA->>Bookmarklet: Sends 'request-resources' with image URLs
    Bookmarklet->>ArticlePage: Searches DOM for matching <img> elements

    loop For each image/resource
        alt Image found in DOM and loaded
            Bookmarklet->>Bookmarklet: Uses canvas to convert to base64
        else Image not in DOM or CORS error
            Bookmarklet->>Resources: Fetches image via network
            Resources-->>Bookmarklet: Image blob
            Bookmarklet->>Bookmarklet: Converts blob to base64 data URL
        end
    end

    Bookmarklet->>SAVRPWA: Sends 'resource-response' with base64 data

    Note over User, Resources: PHASE 5: Article Storage
    SAVRPWA->>SAVRPWA: Processes received data
    SAVRPWA->>SAVRPWA: Saves complete article with all resources
    SAVRPWA-->>User: Shows saved article in PWA

    Note over User, Resources: PHASE 6: Offline Access
    User->>SAVRPWA: Can access saved article offline
    SAVRPWA-->>User: Displays article with all resources
```

## Key Components

### Security Measures

- **Script Removal**: All `<script>` tags are removed
- **Event Handler Stripping**: All `onclick`, `onload`, etc. attributes removed
- **CORS Bypass**: External resources converted to base64 data URLs

### Resource Handling Strategy

1. **DOM First**: Look for already-loaded images in the page
2. **Canvas Conversion**: Use canvas API to extract base64 from loaded images
3. **Network Fallback**: Fetch from network if not in DOM

### Communication Protocol

- **Message Types**:
  - `'savr-ready'`: PWA signals it's ready to receive data
  - `'request-resources'`: PWA requests specific image URLs
  - `'resource-response'`: Bookmarklet sends base64 data back

### Data Flow

1. **HTML**: Cleaned and inlined CSS
2. **Images**: Converted to base64 data URLs
3. **Complete Package**: Self-contained article ready for offline storage
