import React from "react";
import { createTheme, Theme } from "@mui/material/styles";
import { ThemeProvider, CssBaseline } from "@mui/material";

export type ThemeMode = "light" | "dark" | "system";

// Create a theme with the specified mode
export const createAppTheme = (mode: ThemeMode): Theme => {
  // For system mode, default to light (will be overridden by system detection)
  const effectiveMode = mode === "system" ? "light" : mode;

  return createTheme({
    palette: {
      mode: effectiveMode,
      primary: {
        main: "#6a1b9a", // Darker purple instead of blue
      },
      secondary: {
        main: "#dc004e",
      },
    },
  });
};

// Create light theme
export const createLightTheme = (): Theme => createAppTheme("light");

// Create dark theme
export const createDarkTheme = (): Theme => createAppTheme("dark");

// Create system theme (defaults to light)
export const createSystemTheme = (): Theme => createAppTheme("system");

// Theme decorator for Storybook stories
export const withTheme = (mode: ThemeMode) => (Story: React.ComponentType) => {
  const theme = createAppTheme(mode);

  const backgroundColor = mode === "dark" ? "#121212" : "#ffffff";
  const color = mode === "dark" ? "#ffffff" : "#000000";

  return (
    <div
      style={{
        backgroundColor,
        color,
        minHeight: "100vh",
        padding: "20px",
      }}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <Story />
      </ThemeProvider>
    </div>
  );
};

// Convenience decorators for common themes
export const withLightTheme = withTheme("light");
export const withDarkTheme = withTheme("dark");
export const withSystemTheme = withTheme("system");
