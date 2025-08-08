# Savr - Article Reader

A modern article reader built with TanStack Router and Material-UI.

## Environment Configuration

This application supports different configurations for development and production environments:

### Development Mode (Default)
- Sample article URLs are enabled for testing
- CORS proxy is enabled for development
- Debug logging is enabled

### Production Mode
- Sample article URLs are disabled
- CORS proxy is disabled
- Optimized for production deployment

### Environment Variables

The application uses the following environment variables:

- `VITE_APP_MODE`: Set to `development` or `production` (defaults to `development`)
- `VITE_GOOGLE_DRIVE_API_KEY`: Google Drive API key for remote storage
- `VITE_DROPBOX_API_KEY`: Dropbox API key for remote storage

### Available Scripts

```sh
# Development mode (default)
pnpm dev

# Production mode development
pnpm dev:prod

# Build for development
pnpm build:dev

# Build for production
pnpm build:prod

# Build (uses current environment)
pnpm build
```

## Development

From your terminal:

```sh
pnpm install
pnpm dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Editing and previewing the docs of TanStack projects locally

The documentations for all TanStack projects except for `React Charts` are hosted on [https://tanstack.com](https://tanstack.com), powered by this TanStack Router app.
In production, the markdown doc pages are fetched from the GitHub repos of the projects, but in development they are read from the local file system.

Follow these steps if you want to edit the doc pages of a project (in these steps we'll assume it's [`TanStack/form`](https://github.com/tanstack/form)) and preview them locally :

1. Create a new directory called `tanstack`.

```sh
mkdir tanstack
```

2. Enter the directory and clone this repo and the repo of the project there.

```sh
cd tanstack
git clone git@github.com:TanStack/tanstack.com.git
git clone git@github.com:TanStack/form.git
```

> [!NOTE]
> Your `tanstack` directory should look like this:
>
> ```
> tanstack/
>    |
>    +-- form/
>    |
>    +-- tanstack.com/
> ```

> [!WARNING]
> Make sure the name of the directory in your local file system matches the name of the project's repo. For example, `tanstack/form` must be cloned into `form` (this is the default) instead of `some-other-name`, because that way, the doc pages won't be found.

3. Enter the `tanstack/tanstack.com` directory, install the dependencies and run the app in dev mode:

```sh
cd tanstack.com
pnpm i
# The app will run on https://localhost:3000 by default
pnpm dev
```

4. Now you can visit http://localhost:3000/form/latest/docs/overview in the browser and see the changes you make in `tanstack/form/docs`.

> [!NOTE]
> The updated pages need to be manually reloaded in the browser.

> [!WARNING]
> You will need to update the `docs/config.json` file (in the project's repo) if you add a new doc page!
