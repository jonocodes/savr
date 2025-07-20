/// <reference types="vite/client" />
import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import appCss from "~/styles/app.css?url";
import { seo } from "~/utils/seo";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { RemoteStorageProvider } from "~/components/RemoteStorageProvider";
import { PWARegister } from "~/components/PWARegister";

import { SnackbarProvider, VariantType, useSnackbar } from "notistack";
import { getThemeFromCookie, getEffectiveTheme, useSystemThemeListener } from "~/utils/cookies";

// Create theme based on cookie
const createAppTheme = () => {
  const themeMode = getThemeFromCookie();
  const effectiveTheme = getEffectiveTheme(themeMode);
  return createTheme({
    palette: {
      mode: effectiveTheme,
      primary: {
        main: "#1976d2",
      },
      secondary: {
        main: "#dc004e",
      },
    },
  });
};

const theme = createAppTheme();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      ...seo({
        title: "Savr | Read it later",
        description: `Savr is a simple app to read articles later. Sync offline, no server needed.`,
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
    scripts: [
      {
        // src: "/customScript.js",
        // type: "text/javascript",
      },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = React.useState(false);
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());

  React.useEffect(() => {
    // I think this disables SSR. not sure.
    setIsClient(true);
  }, []);

  // Listen for theme changes
  React.useEffect(() => {
    const handleThemeChange = () => {
      setCurrentTheme(getThemeFromCookie());
    };

    // Listen for custom theme change event
    window.addEventListener("themeChanged", handleThemeChange);

    return () => {
      window.removeEventListener("themeChanged", handleThemeChange);
    };
  }, []);

  // Listen for system theme changes
  useSystemThemeListener();

  const appTheme = React.useMemo(() => {
    const effectiveTheme = getEffectiveTheme(currentTheme);
    console.log("Theme debug:", { currentTheme, effectiveTheme });
    return createTheme({
      palette: {
        mode: effectiveTheme,
        primary: {
          main: "#1976d2",
        },
        secondary: {
          main: "#dc004e",
        },
      },
    });
  }, [currentTheme]);

  return (
    <html style={{ height: "100%" }}>
      <head>
        <HeadContent />
      </head>
      <body style={{ height: "100%", margin: 0, padding: 0 }}>
        <SnackbarProvider maxSnack={3}>
          <RemoteStorageProvider>
            <ThemeProvider theme={appTheme}>
              <CssBaseline enableColorScheme />
              {isClient ? (
                <div style={{ minHeight: "100vh", backgroundColor: "background.default" }}>
                  {children}
                  <TanStackRouterDevtools position="bottom-left" />
                  <PWARegister />
                </div>
              ) : (
                <div style={{ minHeight: "100vh", backgroundColor: "background.default" }}>
                  Loading...
                </div>
              )}
              <Scripts />
            </ThemeProvider>
          </RemoteStorageProvider>
        </SnackbarProvider>
      </body>
    </html>
  );
}
