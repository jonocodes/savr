/**
 * Utility functions for network and PWA detection
 */

/**
 * Checks if the app is running as an installed PWA (Progressive Web App)
 * rather than in a regular browser tab.
 *
 * @returns true if running as standalone PWA, false otherwise
 */
export function isPWAMode(): boolean {
  // Check for standalone mode (iOS Safari, Android Chrome)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  // Check for iOS standalone mode (older iOS versions)
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  return false;
}

/**
 * Checks if the Network Information API is supported
 *
 * @returns true if the API is available
 */
export function isNetworkInfoSupported(): boolean {
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;
  return !!connection;
}

/**
 * Checks if the device is currently connected via WiFi.
 *
 * Note: The Network Information API is available on mobile browsers (Chrome, Edge)
 * and PWA installations. It may not be available in desktop browsers.
 *
 * @returns true if on WiFi or if the API is unavailable (safe default), false if on cellular
 */
export function isOnWiFi(): boolean {
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!connection) {
    // If API not available, assume WiFi (safer default - allow sync)
    return true;
  }

  // Check connection type
  // Types can include: 'wifi', 'ethernet', 'cellular', '4g', '3g', '2g', etc.
  const type = connection.type || connection.effectiveType;

  if (!type) {
    // If type is not available, assume WiFi
    return true;
  }

  // Check if explicitly WiFi or ethernet (wired connection)
  if (type === "wifi" || type === "ethernet") {
    return true;
  }

  // If it's cellular or 2g/3g/4g/5g, consider it not WiFi
  if (type === "cellular" || type === "2g" || type === "3g" || type === "4g" || type === "5g") {
    return false;
  }

  // For unknown types, assume WiFi (safe default)
  return true;
}

/**
 * Add an event listener for network connection changes.
 *
 * @param callback Function to call when connection type changes
 * @returns Function to remove the event listener
 */
export function onNetworkChange(callback: () => void): () => void {
  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!connection) {
    // API not available, return no-op cleanup function
    return () => {};
  }

  // Listen for connection changes
  connection.addEventListener("change", callback);

  // Return cleanup function
  return () => {
    connection.removeEventListener("change", callback);
  };
}
