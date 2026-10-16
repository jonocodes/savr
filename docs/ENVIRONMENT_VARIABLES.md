# Environment Variables

This document describes the environment variables used by Savr.

## Available Variables

### `VITE_DEBUG`

- **Default**: `false`
- **Description**: Enables debug mode with development features (dev PWA branding, test hooks on `window`, sample URL prefill in the Add Article dialog). Debug is opt-in so production builds never ship debug behavior by accident; the `dev` and `build:dev` npm scripts set it explicitly.
- **Usage**: `VITE_DEBUG=true npm run dev`

### `VITE_SHOW_WELCOME`

- **Default**: `false`
- **Description**: Controls whether to show the welcome redirect when no articles exist
- **Usage**: `VITE_SHOW_WELCOME=true npm run dev`

### `VITE_GOOGLE_DRIVE_API_KEY`

- **Default**: `undefined`
- **Description**: API key for Google Drive integration (currently disabled)
- **Usage**: `VITE_GOOGLE_DRIVE_API_KEY=your_key npm run dev`

### `VITE_DROPBOX_API_KEY`

- **Default**: `c53glfgceos23cj`
- **Description**: API key for Dropbox integration
- **Usage**: `VITE_DROPBOX_API_KEY=your_key npm run dev`

### `VITE_CORS_PROXY`

- **Default**: `https://lively-cors-proxy-b569.cloudflare8899.workers.dev/?url=`
- **Description**: URL prefix for the CORS proxy used when fetching external articles. This is the build-time default; a user can override it in Preferences, where the value is stored in localStorage (not a cookie) and any token in it is masked in diagnostics and failure reports. Set to empty string to fetch directly (useful for local dev against localhost content servers).
- **Usage**: `VITE_CORS_PROXY="" npm run dev`

Deploy a token-locked proxy of your own from `infra/cors-worker/` (there is a Deploy to Cloudflare button in the README). A self-hosted build served from its own domain **must** do this: the default public proxy only answers savr.link, its Netlify previews, and localhost (`ALLOWED_ORIGINS`, see `infra/cors-worker/README.md`).

### `VITE_FAILURE_REPORT_REPO`

- **Default**: `undefined` (disabled)
- **Description**: Public GitHub repo (`owner/name`) that failure reports target. When set, a failed article load offers a dialog with an editable diagnostic payload and a **File on GitHub** button that opens a prefilled new-issue form under the user's own account, requesting the `failed-url` label. When unset, the dialog and the whole path are absent — self-hosted builds are unaffected. Savr itself makes no network request for this feature.
- **Usage**: `VITE_FAILURE_REPORT_REPO=jonocodes/savr-failure-reports npm run build`

### `VITE_FIREFOX_EXTENSION_URL` / `VITE_CHROME_EXTENSION_URL`

- **Default**: Firefox → `https://savr.link/extension/firefox.xpi` (stable link to the newest signed XPI; see [Releasing](../browser-extension/README.md#releasing)). Chrome → the [browser extension README](https://github.com/jonocodes/savr/tree/main/browser-extension) (install instructions) until a Chrome Web Store listing exists.
- **Description**: Where the Preferences screen links to install the browser extension. Set one to an empty string to hide that link.
- **Usage**: `VITE_CHROME_EXTENSION_URL=https://chromewebstore.google.com/detail/… npm run build`

### `VITE_BUILD_TIMESTAMP`

- **Default**: Current timestamp
- **Description**: Build timestamp for versioning
- **Usage**: Automatically set during build process

## Pre-configured Scripts

The following npm scripts are pre-configured with specific environment variables:

```bash
# Development with welcome enabled
npm run dev:welcome

# Build with welcome enabled
npm run build:welcome

# Production build (debug disabled)
npm run build:prod
```

## Setting Environment Variables

### For Development

```bash
# Set for current session
export VITE_SHOW_WELCOME=true
npm run dev

# Or use inline
VITE_SHOW_WELCOME=true npm run dev
```

### For Production

```bash
# Set environment variable before building
export VITE_SHOW_WELCOME=true
npm run build

# Or use inline
VITE_SHOW_WELCOME=true npm run build
```

### Using .env file

Create a `.env` file in the project root:

```env
VITE_SHOW_WELCOME=true
VITE_DEBUG=true
```

## Notes

- All environment variables must be prefixed with `VITE_` to be accessible in the client-side code
- Environment variables are read at build time, so changes require a restart of the development server
- The welcome functionality is disabled by default to prevent unwanted redirects
