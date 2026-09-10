// Environment configuration for different deployment modes
export interface EnvironmentConfig {
  isDebugMode: boolean;
  defaultCorsProxy: string;
  showWelcome: boolean;
  apiKeys: {
    googleDrive?: string;
    dropbox?: string;
  };
  telemetry: {
    // GoatCounter "count" endpoint, e.g. "https://savr.goatcounter.com/count".
    // When empty (the default), telemetry is disabled entirely. Only the hosted
    // savr.link build sets this, so self-hosters are anonymous/off by default.
    goatCounterUrl: string;
    // The GoatCounter tracker script. Overridable but rarely needs changing.
    scriptUrl: string;
  };
}

// Get environment variables
const getEnvVar = (key: string, defaultValue?: string): string | undefined => {
  if (typeof window !== "undefined") {
    // Client-side: check for Vite env vars
    // Use 'in' operator to check if key exists, allowing empty string values
    return key in import.meta.env ? import.meta.env[key] : defaultValue;
  }
  // Server-side: check for Node.js env vars
  // Use 'in' operator to check if key exists, allowing empty string values
  return key in process.env ? process.env[key] : defaultValue;
};

// Create environment configuration
export const environmentConfig: EnvironmentConfig = {
  isDebugMode: (() => {
    // Debug mode is opt-in: only enabled when VITE_DEBUG is explicitly set
    // (e.g. by the dev/build:dev scripts). Defaulting to enabled caused debug
    // behaviors to ship in any build that didn't explicitly set VITE_DEBUG=false.
    const debugValue = getEnvVar("VITE_DEBUG", "false") || "false";
    return debugValue.toLowerCase() === "true" || debugValue === "1";
  })(),
  defaultCorsProxy:
    getEnvVar(
      "VITE_CORS_PROXY",
      "https://lively-cors-proxy-b569.cloudflare8899.workers.dev/?url=",
    ) || "",
  showWelcome: (() => {
    const welcomeValue = getEnvVar("VITE_SHOW_WELCOME", "false") || "false";
    return welcomeValue.toLowerCase() === "true" || welcomeValue === "1";
  })(),
  apiKeys: {
    googleDrive: getEnvVar(
      "VITE_GOOGLE_DRIVE_API_KEY",
      "165908882916-eg939u0ptdpbusn6pn63he9ntlspffmn.apps.googleusercontent.com",
    ),
    dropbox: getEnvVar("VITE_DROPBOX_API_KEY", "c53glfgceos23cj"),
  },
  telemetry: {
    // Default empty => telemetry off (self-host builds collect nothing).
    goatCounterUrl: getEnvVar("VITE_GOATCOUNTER_URL", "") || "",
    scriptUrl: getEnvVar("VITE_GOATCOUNTER_SCRIPT", "https://gc.zgo.at/count.js") || "",
  },
};

export const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || new Date(0).toISOString();

// Helper functions
export const isDebugMode = () => environmentConfig.isDebugMode;
export const getDefaultCorsProxy = () => environmentConfig.defaultCorsProxy;
export const shouldShowWelcome = () => environmentConfig.showWelcome;

// Telemetry is "configured" only when a GoatCounter endpoint has been provided
// at build time. Self-host builds leave it empty, so nothing is ever collected.
export const getGoatCounterUrl = () => environmentConfig.telemetry.goatCounterUrl;
export const getGoatCounterScriptUrl = () => environmentConfig.telemetry.scriptUrl;
export const isTelemetryConfigured = () => environmentConfig.telemetry.goatCounterUrl !== "";
