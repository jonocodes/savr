# Environment Variables

This document describes the environment variables used by Savr.

## Available Variables

### `VITE_DEBUG`

- **Default**: `true`
- **Description**: Enables debug mode with development features
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
