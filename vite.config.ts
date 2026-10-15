import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { transform as esbuildTransform } from "esbuild";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

// The browser extension owns the YouTube extraction (it serializes the same
// function into the watch tab), and the prefs page imports that module with
// ?bookmarklet so the minify-bookmarklet plugin can assemble the bookmarklet
// around it. One source, two transports. Import it as:
//   browser-extension/youtube-transcript.js?bookmarklet -> `export default "..."`
const youtubeExtractorFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "browser-extension/youtube-transcript.js"
);

/** The bookmarklet transport around the shared extraction function. */
function buildTranscriptBookmarklet(extractionSource: string): string {
  return `(async () => {
  const SAVR_ORIGIN = "__SAVR_ORIGIN__";
  const result = await (${extractionSource})();
  if (!result.ok) {
    alert(result.reason || "Could not extract the YouTube transcript.");
    return;
  }
  const savrWindow = window.open(SAVR_ORIGIN + "/?rawIngest=1", "_blank");
  if (!savrWindow) {
    alert("Could not open the Savr window. Please allow pop-ups for this site.");
    return;
  }
  let sent = false;
  const onMessage = (event) => {
    if (event.source !== savrWindow) return;
    if (!event.data || event.data.action !== "savr-ready" || sent) return;
    sent = true;
    window.removeEventListener("message", onMessage);
    savrWindow.postMessage({
      action: "savr-raw",
      content: result.content,
      contentType: result.contentType,
      title: result.title,
      author: result.author,
      url: result.url,
    }, SAVR_ORIGIN);
  };
  window.addEventListener("message", onMessage);
})();`;
}

const bookmarkletPlugin = {
  name: "minify-bookmarklet",
  enforce: "pre" as const,
  async load(id: string) {
    if (id !== `${youtubeExtractorFile}?bookmarklet`) return;
    // Cache-bust the import so edits to the extractor show up without a
    // dev-server restart.
    const moduleUrl = `${pathToFileURL(youtubeExtractorFile).href}?t=${Date.now()}`;
    const extractor = (await import(moduleUrl)) as {
      scrapeYouTubeTranscript: () => Promise<unknown>;
    };
    const wrapper = buildTranscriptBookmarklet(extractor.scrapeYouTubeTranscript.toString());
    const result = await esbuildTransform(wrapper, { minify: true });
    return `export default ${JSON.stringify(result.code)};`;
  },
};

export default defineConfig(() => {
  // Use DEBUG environment variable for feature flags.
  // Debug is opt-in (see src/config/environment.ts) so plain builds get
  // production branding/icons unless VITE_DEBUG=true is set explicitly.
  const isDebug = (() => {
    const debugValue = process.env.VITE_DEBUG || "false";
    return debugValue.toLowerCase() === "true" || debugValue === "1";
  })();
  const devTitle = "Savr DEV - Save Articles for Reading";
  const prodTitle = "Savr - Save Articles for Reading";

  return {
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          main: "index.html",
        },
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".js")) {
              return "js/[name]-[hash][extname]";
            }
            if (assetInfo.name?.endsWith(".css")) {
              return "css/[name]-[hash][extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
          chunkFileNames: "js/[name]-[hash].js",
          entryFileNames: "js/[name]-[hash].js",
        },
      },
    },
    base: "/", // its a bummer I have to use a non-relative base path, but I need to do this to support the url path param in production
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
      proxy: {},
    },
    appType: "spa",
    preview: {
      port: 3000,
    },
    define: {
      __DEV__: true,
    },
    plugins: [
      bookmarkletPlugin,
      {
        name: "serve-index",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === "/") {
              req.url = "/index.html";
            }
            next();
          });
        },
      },
      // Dynamic favicon and title plugin
      {
        name: "dynamic-favicon-and-title",
        transformIndexHtml(html) {
          const devIcon = "/dev/favicon.ico"; // Development icon
          const prodIcon = "/favicon.ico"; // Production icon

          return html
            .replace(
              /<link rel="icon"[^>]*>/,
              `<link rel="icon" type="image/svg+xml" href="${isDebug ? devIcon : prodIcon}" />`
            )
            .replace(/<title>.*?<\/title>/, `<title>${isDebug ? devTitle : prodTitle}</title>`);
        },
      },
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: isDebug
          ? ["dev/favicon.ico", "dev/apple-touch-icon.png", "dev/favicon.png", "dev/icon.png"]
          : ["favicon.ico", "apple-touch-icon.png", "favicon.png", "icon.png"],
        manifest: {
          name: isDebug ? devTitle : prodTitle,
          short_name: isDebug ? "Savr DEV" : "Savr",
          description: "Save and read articles offline with a clean, distraction-free interface",
          // Tag launches from the installed icon so telemetry can distinguish
          // installed-PWA opens even where display-mode detection is quirky.
          start_url: "/?s=pwa",
          display: "standalone",
          background_color: "#390055", //dark purple
          theme_color: "#000000",
          orientation: "any",
          scope: "/",
          lang: "en",
          categories: ["productivity", "utilities"],
          icons: isDebug
            ? [
                {
                  src: "/dev/icon.png",
                  sizes: "192x192",
                  type: "image/png",
                  purpose: "any maskable",
                },
                {
                  src: "/dev/icon.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "any maskable",
                },
              ]
            : [
                {
                  src: "/icon.png",
                  sizes: "192x192",
                  type: "image/png",
                  purpose: "any maskable",
                },
                {
                  src: "/adaptive-icon.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "any maskable",
                },
              ],
          share_target: {
            action: "/share-handler",
            method: "GET",
            params: {
              text: "text",
              url: "url",
              title: "title",
            },
            enctype: "application/x-www-form-urlencoded",
          },
          screenshots: [
            {
              src: "/screenshots/screenshots.png",
              sizes: "1683x1078",
              type: "image/png",
              platform: "wide",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
          // /extension/firefox.xpi is a Netlify redirect to the signed add-on;
          // the app-shell fallback would otherwise swallow that navigation.
          navigateFallbackDenylist: [/^\/extension\//],
          runtimeCaching: [
            {
              // Never cache or replay analytics — always hit the network, and let
              // it fail silently when offline (no queued/duplicated events).
              urlPattern: /^https:\/\/(gc\.zgo\.at|[^/]*\.goatcounter\.com)\/.*/i,
              handler: "NetworkOnly",
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
                },
              },
            },
          ],
        },
      }),
    ],
  };
});
