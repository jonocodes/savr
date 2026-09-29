// Detecting whether Savr is running as an installed PWA.
//
// Covers Chromium/Android/desktop (display-mode) and iOS Safari
// (navigator.standalone) — the only reliable cross-platform install signal,
// since iOS never fires beforeinstallprompt/appinstalled.
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    iosStandalone === true
  );
}
