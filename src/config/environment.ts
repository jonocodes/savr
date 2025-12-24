// Environment configuration for different deployment modes
export interface EnvironmentConfig {
  isDebugMode: boolean;
  defaultCorsProxy: string;
  showWelcome: boolean;
  apiKeys: {
    googleDrive?: string;
    dropbox?: string;
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
    const debugValue = getEnvVar("VITE_DEBUG", "true") || "true";
    return debugValue.toLowerCase() === "true" || debugValue === "1";
  })(),
  defaultCorsProxy: getEnvVar("VITE_CORS_PROXY", "https://lively-cors-proxy-b569.cloudflare8899.workers.dev/?url=") || "",
  showWelcome: (() => {
    const welcomeValue = getEnvVar("VITE_SHOW_WELCOME", "false") || "false";
    return welcomeValue.toLowerCase() === "true" || welcomeValue === "1";
  })(),
  apiKeys: {
    googleDrive: getEnvVar(
      "VITE_GOOGLE_DRIVE_API_KEY"
      // NOTE: this is disabled for now since I have not been able to get google drive working
      // "298611806550-k3kc4obucu2ds6v9dlmvteqp6ve5dn6m.apps.googleusercontent.com"
    ),
    dropbox: getEnvVar("VITE_DROPBOX_API_KEY", "c53glfgceos23cj"),
  },
};

export const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || new Date(0).toISOString();

// Helper functions
export const isDebugMode = () => environmentConfig.isDebugMode;
export const getDefaultCorsProxy = () => environmentConfig.defaultCorsProxy;
export const shouldShowWelcome = () => environmentConfig.showWelcome;
