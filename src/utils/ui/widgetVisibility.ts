/**
 * Widget visibility logic - extracted for unit testing
 */

/**
 * Parse cookies to get a specific cookie value
 * @param cookieString - The document.cookie string
 * @param cookieName - The name of the cookie to find
 * @returns The cookie value or null if not found
 */
export function getCookieValue(cookieString: string, cookieName: string): string | null {
  const cookie = cookieString.split("; ").find((row) => row.startsWith(`${cookieName}=`));
  if (cookie) {
    return cookie.split("=")[1];
  }
  return null;
}

/**
 * Determine if sync is enabled based on cookie value
 * @param cookieValue - The value of the sync enabled cookie (or null if not set)
 * @returns true if sync is enabled, false otherwise. Defaults to true if not set.
 */
export function isSyncEnabled(cookieValue: string | null): boolean {
  if (cookieValue === null) {
    return true; // Default to enabled
  }
  return cookieValue === "true";
}

/**
 * Check if the current pathname is an article reading page
 * @param pathname - The current window.location.pathname
 * @returns true if on an article page
 */
export function isArticlePage(pathname: string): boolean {
  return pathname.startsWith("/article/");
}

/**
 * Determine if the widget should be visible
 * @param syncEnabled - Whether sync is enabled
 * @param pathname - The current pathname
 * @returns true if widget should be visible
 */
export function shouldShowWidget(syncEnabled: boolean, pathname: string): boolean {
  return syncEnabled && !isArticlePage(pathname);
}
