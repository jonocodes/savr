import React from "react";

// Cookie-based theme management
export type ThemeMode = "light" | "dark" | "system";

const THEME_COOKIE_NAME = "savr-theme";
const FONT_SIZE_COOKIE_NAME = "savr-font-size";
const CORS_PROXY_COOKIE_NAME = "savr-cors-proxy";

// Get system preference
export const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  console.log("System theme detection:", {
    isDark,
    prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  });
  return isDark ? "dark" : "light";
};

// Get effective theme (system preference if mode is "system")
export const getEffectiveTheme = (mode: ThemeMode): "light" | "dark" => {
  console.log("getEffectiveTheme called with mode:", mode);
  if (mode === "system") {
    const systemTheme = getSystemTheme();
    return systemTheme;
  }
  return mode;
};

// Hook to listen for system theme changes
export const useSystemThemeListener = () => {
  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      // Dispatch theme change event when system theme changes
      window.dispatchEvent(new CustomEvent("themeChanged"));
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
};

// Get theme from cookie
export const getThemeFromCookie = (): ThemeMode => {
  if (typeof document === "undefined") return "light";

  const cookies = document.cookie.split(";");
  const themeCookie = cookies.find((cookie) => cookie.trim().startsWith(`${THEME_COOKIE_NAME}=`));

  if (themeCookie) {
    const theme = themeCookie.split("=")[1];
    if (theme === "light" || theme === "dark" || theme === "system") {
      return theme;
    }
  }

  return "light";
};

// Get font size from cookie
export const getFontSizeFromCookie = (): number => {
  if (typeof document === "undefined") return 16;

  const cookies = document.cookie.split(";");
  const fontSizeCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${FONT_SIZE_COOKIE_NAME}=`)
  );

  if (fontSizeCookie) {
    const value = parseInt(fontSizeCookie.split("=")[1]);
    if (!isNaN(value) && value >= 12 && value <= 24) {
      return value;
    }
  }

  return 16;
};

// Get CORS proxy from cookie
export const getCorsProxyFromCookie = (): string | null => {
  if (typeof document === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  const corsProxyCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${CORS_PROXY_COOKIE_NAME}=`)
  );

  if (corsProxyCookie) {
    const value = corsProxyCookie.replace(`${CORS_PROXY_COOKIE_NAME}=`, "");
    return value || null;
  }

  return null;
};

// Set CORS proxy in cookie
export const setCorsProxyInCookie = (corsProxy: string | null): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  if (corsProxy) {
    document.cookie = `${CORS_PROXY_COOKIE_NAME}=${corsProxy}; expires=${expires.toUTCString()}; path=/`;
  } else {
    // Remove cookie if value is null
    document.cookie = `${CORS_PROXY_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

// Set font size in cookie
export const setFontSizeInCookie = (fontSize: number): void => {
  if (typeof document === "undefined") return;

  // Clamp font size between 12 and 24
  const clampedSize = Math.max(12, Math.min(24, fontSize));

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${FONT_SIZE_COOKIE_NAME}=${clampedSize}; expires=${expires.toUTCString()}; path=/`;
};

// Set theme in cookie
export const setThemeInCookie = (theme: ThemeMode): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${THEME_COOKIE_NAME}=${theme}; expires=${expires.toUTCString()}; path=/`;
};

// Toggle theme (cycles: light -> dark -> system -> light)
export const toggleTheme = (): ThemeMode => {
  const currentTheme = getThemeFromCookie();
  let newTheme: ThemeMode;

  switch (currentTheme) {
    case "light":
      newTheme = "dark";
      break;
    case "dark":
      newTheme = "system";
      break;
    case "system":
      newTheme = "light";
      break;
    default:
      newTheme = "light";
  }

  setThemeInCookie(newTheme);
  return newTheme;
};
