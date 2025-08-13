import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";

import { ThemeProvider, CssBaseline } from "@mui/material";
import { RemoteStorageProvider } from "~/components/RemoteStorageProvider";
import { PWARegister } from "~/components/PWARegister";

import { SnackbarProvider } from "notistack";
import { getThemeFromCookie, getEffectiveTheme, useSystemThemeListener } from "~/utils/cookies";
import { createAppTheme } from "~/utils/theme";

export const Route = createRootRoute({
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <UrlPatternMatcher />,
  component: RootComponent,
});

function UrlPatternMatcher() {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Get the current pathname
    const pathname = window.location.pathname;

    // Check if the pathname starts with /http or /https
    if (pathname.startsWith("/http") || pathname.startsWith("/https")) {
      // Extract the URL part (remove the leading slash)
      const urlPart = pathname.substring(1);
      setUrl(urlPart);
    }
  }, []);

  // If we found a URL pattern, show the URL capture page
  if (url) {
    const redirectUrl = "/?saveUrl=" + encodeURIComponent(url);

    return (
      <div style={{ minHeight: "100vh", backgroundColor: "background.default", padding: "2rem" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h1>URL Captured</h1>
          <h2>URL = {url}</h2>
          <p>
            This route captured the URL: <strong>{url}</strong>
          </p>
          <p>
            <strong>Redirect URL:</strong> {redirectUrl}
          </p>
          <p>Click the link below to save this URL:</p>
          <a
            href={redirectUrl}
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: "#1976d2",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px",
              marginTop: "1rem",
            }}
          >
            Save URL
          </a>
          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              backgroundColor: "#f5f5f5",
              borderRadius: "4px",
            }}
          >
            <pre style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(
                {
                  url: url,
                  pathname: window.location.pathname,
                  fullUrl: window.location.href,
                  redirectUrl: redirectUrl,
                },
                null,
                2
              )}
            </pre>
          </div>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                setTimeout(() => {
                  window.location.href = "/?saveUrl=" + encodeURIComponent("${url}");
                }, 3000);
              `,
            }}
          />
        </div>
      </div>
    );
  }

  // Otherwise, show the normal NotFound component
  return <NotFound />;
}

function RootComponent() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());

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
    return createAppTheme(effectiveTheme);
  }, [currentTheme]);

  return (
    <SnackbarProvider maxSnack={3}>
      <RemoteStorageProvider>
        <ThemeProvider theme={appTheme}>
          <CssBaseline enableColorScheme />
          <div style={{ minHeight: "100vh", backgroundColor: "background.default" }}>
            <Outlet />
            <TanStackRouterDevtools position="bottom-left" />
            <PWARegister />
          </div>
        </ThemeProvider>
      </RemoteStorageProvider>
    </SnackbarProvider>
  );
}
