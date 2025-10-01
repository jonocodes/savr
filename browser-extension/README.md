# HTML Data Collector - Firefox Extension

A Firefox browser extension that collects comprehensive HTML data from web pages and displays it in a scrollable popup interface.

## Features

- **Complete HTML Collection**: Captures the entire HTML structure of the current page
- **Page Statistics**: Shows page title, URL, HTML size, and element count
- **Scrollable Interface**: Clean, modern popup with scrollable content area
- **Data Export**: Copy HTML to clipboard or download as HTML file
- **Rich Metadata**: Collects meta tags, links, images, forms, and performance data
- **Persistent Storage**: Saves collected data for later viewing
- **Security**: Removes script tags from collected HTML for safety

## Installation

1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this directory

## Usage

1. Click the extension icon in the Firefox toolbar
2. Click "Collect HTML Data" to capture the current page's HTML
3. View the collected data in the scrollable popup
4. Use the control buttons to:
   - **Copy HTML**: Copy the HTML content to clipboard
   - **Download**: Download the HTML as a file
   - **Clear**: Clear the current data

## Files Structure

```
browser-extension/
├── manifest.json          # Extension manifest
├── popup.html             # Popup interface
├── popup.css              # Popup styling
├── popup.js               # Popup functionality
├── content.js             # Content script for data collection
├── background.js          # Background script
├── icons/                 # Extension icons (placeholder)
└── README.md              # This file
```

## Data Collected

The extension collects:

- **Basic Info**: Page title, URL, timestamp
- **HTML Content**: Complete HTML structure
- **Metadata**: Meta tags, charset, language
- **Resources**: Stylesheets, scripts, images
- **Forms**: Form elements and input fields
- **Content**: Headings, text content, word count
- **Performance**: Page load times
- **Statistics**: Element counts, text nodes, etc.

## Security

- Script tags are removed from collected HTML for security
- No sensitive data (passwords, etc.) is collected
- Data is stored locally in the browser

## Browser Compatibility

- Firefox (Manifest V2)
- Requires permissions: `activeTab`, `storage`

## Development

To modify the extension:

1. Edit the relevant files
2. Reload the extension in `about:debugging`
3. Test the changes

## License

This extension is part of the Savr project and follows the same GPL-3.0 license.
