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
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

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
