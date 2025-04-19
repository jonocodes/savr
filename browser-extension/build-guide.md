# Building and Using the SAVR Helper Extension (TypeScript Version)

This guide will walk you through setting up, building, and using the TypeScript version of the SAVR Helper browser extension.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14.x or higher)
- npm (comes with Node.js)
- A modern web browser (Chrome, Firefox, or Edge)

## Project Setup

1. **Create the project directory structure**

   Create the directory structure as shown below:

   ```
   browser-extension/
   ├── src/
   │   ├── background.ts
   │   ├── content/
   │   │   └── content.ts
   │   └── popup/
   │       ├── popup.ts
   │       ├── popup.html
   │       └── popup.css
   ├── public/
   │   ├── manifest.json
   │   └── icons/
   │       ├── icon16.png
   │       ├── icon48.png
   │       └── icon128.png
   ```

2. **Initialize the project**

   Open a terminal in the `browser-extension` directory and run:

   ```bash
   npm init -y
   ```

3. **Install dependencies**

   ```bash
   npm install --save-dev typescript webpack webpack-cli ts-loader copy-webpack-plugin css-loader mini-css-extract-plugin html-webpack-plugin @types/chrome eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser rimraf
   ```

4. **Create configuration files**

   Create `tsconfig.json`, `webpack.config.js`, and update `package.json` with the content provided in the previous code samples.

## Create Extension Files

1. **Add source files**

   Create the following files with the content provided earlier:

   - `src/background.ts`
   - `src/content/content.ts`
   - `src/popup/popup.html`
   - `src/popup/popup.css`
   - `src/popup/popup.ts`
   - `public/manifest.json`

2. **Create placeholder icons**

   Create three PNG icon files in various sizes:

   - `public/icons/icon16.png` (16x16 pixels)
   - `public/icons/icon48.png` (48x48 pixels)
   - `public/icons/icon128.png` (128x128 pixels)

   You can use any image editing software to create simple placeholder icons, or use online services to generate browser extension icons.

## Build the Extension

1. **Build the extension**

   Run the following command to compile and bundle the extension:

   ```bash
   npm run build
   ```

   This will create a `dist` directory with the built extension files.

2. **Watch for changes (optional)**

   During development, you may want to automatically rebuild when files change:

   ```bash
   npm run watch
   ```

   Or use the development mode for more verbose output:

   ```bash
   npm run dev
   ```

## Load the Extension in Your Browser

### Chrome / Edge

1. Open Chrome/Edge and navigate to `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `dist` directory from your project
4. The extension should now appear in your browser toolbar

### Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Navigate to your project directory and select the `manifest.json` file from the `dist` directory
4. The extension should now appear in your browser toolbar

## Integrate with Your PWA

1. **Add the PWA integration code**

   Add the TypeScript PWA integration code to your PWA project. If your PWA uses JavaScript instead of TypeScript, you'll need to compile this file separately or convert it to JavaScript.

2. **Update the storage implementation**

   Replace the placeholder storage implementation with your actual remoteStorage.js implementation in the `getStorage`, `saveToIndexedDB`, and `saveResourceToIndexedDB` methods.

3. **Initialize the connector**

   Make sure the `ExtensionConnector` is initialized when your PWA starts up and is accessible from your components that need to use it.

## Usage

1. Navigate to a web page you want to save
2. Click the extension icon in your browser toolbar
3. Click the "Save This Page" button
4. The extension will fetch the HTML and send it to your PWA
5. The PWA will process the HTML, extract image URLs, and request the extension to fetch those images
6. The extension will fetch the images and send them back to the PWA
7. The PWA will save both the HTML and images to IndexedDB using remoteStorage.js

## Debugging

- For extension debugging, use the browser's extension development tools:

  - In Chrome/Edge: Right-click the extension icon, select "Inspect popup" (for the popup) or go to the extension page and click "background page" (for the background script)
  - In Firefox: Go to `about:debugging#/runtime/this-firefox`, find your extension, and click "Inspect"

- For PWA debugging, use the browser's standard developer tools (F12 or right-click > Inspect)

## Publishing (Optional)

When you're ready to publish your extension:

1. Update the version number in `manifest.json`
2. Build the extension: `npm run build`
3. Create a ZIP file of the `dist` directory
4. Submit to the respective browser extension stores:
   - [Chrome Web Store](https://chrome.google.com/webstore/devconsole/)
   - [Firefox Add-ons](https://addons.mozilla.org/developers/)
   - [Microsoft Edge Add-ons](https://developer.microsoft.com/microsoft-edge/extensions/)

## Making Changes

If you need to make changes to the extension:

1. Modify the source files in the `src` directory
2. Rebuild the extension: `npm run build`
3. Refresh the extension in your browser:
   - In Chrome/Edge: Go to `chrome://extensions` or `edge://extensions` and click the refresh icon on your extension
   - In Firefox: Go to `about:debugging#/runtime/this-firefox` and click "Reload" on your extension
