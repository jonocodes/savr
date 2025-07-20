// Environment configuration for different deployment modes
export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  enableSampleUrls: boolean;
  corsProxy: string | null;
  apiKeys: {
    googleDrive?: string;
    dropbox?: string;
  };
}

// Get environment variables
const getEnvVar = (key: string, defaultValue?: string): string | undefined => {
  if (typeof window !== "undefined") {
    // Client-side: check for Vite env vars
    return import.meta.env[key] || defaultValue;
  }
  // Server-side: check for Node.js env vars
  return process.env[key] || defaultValue;
};

// Determine environment mode
const getEnvironmentMode = (): "development" | "production" => {
  const mode = getEnvVar("VITE_APP_MODE", "development");
  return mode === "production" ? "production" : "development";
};

// Create environment configuration
export const environmentConfig: EnvironmentConfig = {
  isDevelopment: getEnvironmentMode() === "development",
  isProduction: getEnvironmentMode() === "production",
  enableSampleUrls: getEnvironmentMode() === "development",
  corsProxy:
    getEnvironmentMode() === "development"
      ? "https://lively-cors-proxy-b569.cloudflare8899.workers.dev/?url="
      : null,
  apiKeys: {
    googleDrive: getEnvVar(
      "VITE_GOOGLE_DRIVE_API_KEY",
      "298611806550-k3kc4obucu2ds6v9dlmvteqp6ve5dn6m.apps.googleusercontent.com"
    ),
    dropbox: getEnvVar("VITE_DROPBOX_API_KEY", "c53glfgceos23cj"),
  },
};

// Helper functions
export const isDevelopment = () => environmentConfig.isDevelopment;
export const isProduction = () => environmentConfig.isProduction;
export const shouldEnableSampleUrls = () => environmentConfig.enableSampleUrls;
export const getCorsProxy = () => environmentConfig.corsProxy;
