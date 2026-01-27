import React from "react";

// Cookie-based theme management
export type ThemeMode = "light" | "dark" | "system";

export const THEME_COOKIE_NAME = "savr-theme";
export const FONT_SIZE_COOKIE_NAME = "savr-font-size";
export const CORS_PROXY_COOKIE_NAME = "savr-cors-proxy";
export const HEADER_HIDING_COOKIE_NAME = "savr-header-hiding";
export const AFTER_EXTERNAL_SAVE_COOKIE_NAME = "savr-after-external-save";
export const SYNC_ENABLED_COOKIE_NAME = "savr-sync-enabled";
export const WIFI_ONLY_SYNC_COOKIE_NAME = "savr-wifi-only-sync";
export const SUMMARY_PROMPT_COOKIE_NAME = "savr-summary-prompt";
export const SUMMARIZATION_ENABLED_COOKIE_NAME = "savr-summarization-enabled";
export const SUMMARY_PROVIDER_COOKIE_NAME = "savr-summary-provider";
export const SUMMARY_MODEL_COOKIE_NAME = "savr-summary-model";
export const SUMMARY_API_KEYS_COOKIE_NAME = "savr-summary-api-keys";
export const SUMMARY_SETTINGS_COOKIE_NAME = "savr-summary-settings";

// After external save action constants
export const AFTER_EXTERNAL_SAVE_ACTIONS = {
  SHOW_ARTICLE: "show-article",
  SHOW_LIST: "show-list",
  CLOSE_TAB: "close-tab",
} as const;

export type AfterExternalSaveAction =
  (typeof AFTER_EXTERNAL_SAVE_ACTIONS)[keyof typeof AFTER_EXTERNAL_SAVE_ACTIONS];

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
    const value = corsProxyCookie.replace(`${CORS_PROXY_COOKIE_NAME}=`, "").trim();
    // Only return the value if it's not empty (user has explicitly set a custom value)
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

  if (corsProxy && corsProxy.trim()) {
    // Only save if user has explicitly set a non-empty value
    document.cookie = `${CORS_PROXY_COOKIE_NAME}=${corsProxy.trim()}; expires=${expires.toUTCString()}; path=/`;
  } else {
    // Remove cookie if value is null or empty
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

// Get header hiding preference from cookie
export const getHeaderHidingFromCookie = (): boolean => {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie.split(";");
  const headerHidingCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${HEADER_HIDING_COOKIE_NAME}=`)
  );

  if (headerHidingCookie) {
    const value = headerHidingCookie.split("=")[1];
    return value === "true";
  }

  return false;
};

// Set header hiding preference in cookie
export const setHeaderHidingInCookie = (enabled: boolean): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${HEADER_HIDING_COOKIE_NAME}=${enabled}; expires=${expires.toUTCString()}; path=/`;
};

// Get after external save preference from cookie
export const getAfterExternalSaveFromCookie = (): AfterExternalSaveAction => {
  if (typeof document === "undefined") return AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB; // Default to close tab

  const cookies = document.cookie.split(";");
  const afterExternalSaveCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${AFTER_EXTERNAL_SAVE_COOKIE_NAME}=`)
  );

  if (afterExternalSaveCookie) {
    const value = afterExternalSaveCookie.split("=")[1];
    if (
      value === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE ||
      value === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST ||
      value === AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB
    ) {
      return value;
    }
  }

  return AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB; // Default to close tab
};

// Set after external save preference in cookie
export const setAfterExternalSaveInCookie = (value: AfterExternalSaveAction): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${AFTER_EXTERNAL_SAVE_COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/`;
};

// DISABLED - WiFi-only sync feature not working correctly
// Get WiFi-only sync preference from cookie
// export const getWiFiOnlySyncFromCookie = (): boolean => {
//   if (typeof document === "undefined") return false;

//   const cookies = document.cookie.split(";");
//   const wifiOnlySyncCookie = cookies.find((cookie) =>
//     cookie.trim().startsWith(`${WIFI_ONLY_SYNC_COOKIE_NAME}=`)
//   );

//   if (wifiOnlySyncCookie) {
//     const value = wifiOnlySyncCookie.split("=")[1];
//     return value === "true";
//   }

//   return false; // Default to false (sync on all networks)
// };

// Set WiFi-only sync preference in cookie
// export const setWiFiOnlySyncInCookie = (enabled: boolean): void => {
//   if (typeof document === "undefined") return;

//   // Set cookie to expire in 1 year
//   const expires = new Date();
//   expires.setFullYear(expires.getFullYear() + 1);

//   document.cookie = `${WIFI_ONLY_SYNC_COOKIE_NAME}=${enabled}; expires=${expires.toUTCString()}; path=/`;
// };

// Get summary prompt from cookie (returns null if not set, meaning use default)
export const getSummaryPromptFromCookie = (): string | null => {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  const summaryPromptCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_PROMPT_COOKIE_NAME}=`)
  );

  if (summaryPromptCookie) {
    const value = decodeURIComponent(
      summaryPromptCookie.replace(`${SUMMARY_PROMPT_COOKIE_NAME}=`, "").trim()
    );
    return value || null;
  }

  return null;
};

// Set summary prompt in cookie
export const setSummaryPromptInCookie = (prompt: string | null): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  if (prompt && prompt.trim()) {
    // Encode the prompt to handle special characters
    document.cookie = `${SUMMARY_PROMPT_COOKIE_NAME}=${encodeURIComponent(prompt.trim())}; expires=${expires.toUTCString()}; path=/`;
  } else {
    // Remove cookie if value is null or empty
    document.cookie = `${SUMMARY_PROMPT_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

// Get summarization enabled preference from cookie (defaults to false)
export const getSummarizationEnabledFromCookie = (): boolean => {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie.split(";");
  const summarizationEnabledCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARIZATION_ENABLED_COOKIE_NAME}=`)
  );

  if (summarizationEnabledCookie) {
    const value = summarizationEnabledCookie.split("=")[1];
    return value === "true";
  }

  return false; // Default to disabled
};

// Set summarization enabled preference in cookie
export const setSummarizationEnabledInCookie = (enabled: boolean): void => {
  if (typeof document === "undefined") return;

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${SUMMARIZATION_ENABLED_COOKIE_NAME}=${enabled}; expires=${expires.toUTCString()}; path=/`;
};

// Get summary provider from cookie (defaults to "groq")
export const getSummaryProviderFromCookie = (): string => {
  if (typeof document === "undefined") return "groq";

  const cookies = document.cookie.split(";");
  const providerCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_PROVIDER_COOKIE_NAME}=`)
  );

  if (providerCookie) {
    const value = providerCookie.split("=")[1]?.trim();
    return value || "groq";
  }

  return "groq";
};

// Set summary provider in cookie
export const setSummaryProviderInCookie = (provider: string): void => {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${SUMMARY_PROVIDER_COOKIE_NAME}=${provider}; expires=${expires.toUTCString()}; path=/`;
};

// Get summary model from cookie (defaults to "llama-3.3-70b-versatile")
export const getSummaryModelFromCookie = (): string => {
  if (typeof document === "undefined") return "llama-3.3-70b-versatile";

  const cookies = document.cookie.split(";");
  const modelCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_MODEL_COOKIE_NAME}=`)
  );

  if (modelCookie) {
    const value = modelCookie.split("=")[1]?.trim();
    return value || "llama-3.3-70b-versatile";
  }

  return "llama-3.3-70b-versatile";
};

// Set summary model in cookie
export const setSummaryModelInCookie = (model: string): void => {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${SUMMARY_MODEL_COOKIE_NAME}=${model}; expires=${expires.toUTCString()}; path=/`;
};

// Get API keys from cookie (stored as JSON object: { groq: "key", openai: "key" })
export const getApiKeysFromCookie = (): Record<string, string> => {
  if (typeof document === "undefined") return {};

  const cookies = document.cookie.split(";");
  const keysCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_API_KEYS_COOKIE_NAME}=`)
  );

  if (keysCookie) {
    try {
      const value = decodeURIComponent(
        keysCookie.replace(`${SUMMARY_API_KEYS_COOKIE_NAME}=`, "").trim()
      );
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }

  return {};
};

// Set API keys in cookie
export const setApiKeysInCookie = (keys: Record<string, string>): void => {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${SUMMARY_API_KEYS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(keys))}; expires=${expires.toUTCString()}; path=/`;
};

// Get single API key for a provider
export const getApiKeyForProvider = (provider: string): string | null => {
  const keys = getApiKeysFromCookie();
  return keys[provider] || null;
};

// Set single API key for a provider
export const setApiKeyForProvider = (provider: string, key: string | null): void => {
  const keys = getApiKeysFromCookie();
  if (key) {
    keys[provider] = key;
  } else {
    delete keys[provider];
  }
  setApiKeysInCookie(keys);
};

// Summary settings type
export interface SummarySettingsCookie {
  detailLevel: number;
  tone: string;
  focus: string;
  format: string;
  customPrompt: string;
}

const DEFAULT_SUMMARY_SETTINGS_COOKIE: SummarySettingsCookie = {
  detailLevel: 2,
  tone: "neutral",
  focus: "general",
  format: "paragraphs",
  customPrompt: "",
};

// Get summary settings from cookie
export const getSummarySettingsFromCookie = (): SummarySettingsCookie => {
  if (typeof document === "undefined") return DEFAULT_SUMMARY_SETTINGS_COOKIE;

  const cookies = document.cookie.split(";");
  const settingsCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${SUMMARY_SETTINGS_COOKIE_NAME}=`)
  );

  if (settingsCookie) {
    try {
      const value = decodeURIComponent(
        settingsCookie.replace(`${SUMMARY_SETTINGS_COOKIE_NAME}=`, "").trim()
      );
      return { ...DEFAULT_SUMMARY_SETTINGS_COOKIE, ...JSON.parse(value) };
    } catch {
      return DEFAULT_SUMMARY_SETTINGS_COOKIE;
    }
  }

  return DEFAULT_SUMMARY_SETTINGS_COOKIE;
};

// Set summary settings in cookie
export const setSummarySettingsInCookie = (settings: Partial<SummarySettingsCookie>): void => {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  const currentSettings = getSummarySettingsFromCookie();
  const newSettings = { ...currentSettings, ...settings };

  document.cookie = `${SUMMARY_SETTINGS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(newSettings))}; expires=${expires.toUTCString()}; path=/`;
};
