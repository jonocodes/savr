import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Use DEBUG environment variable for feature flags
  const isDebug = (() => {
    const debugValue = process.env.VITE_DEBUG || "true";
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
          start_url: "/",
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
          runtimeCaching: [
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
