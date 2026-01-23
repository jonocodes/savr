import { useEffect, useState } from "react";
import { Button, Snackbar, Alert } from "@mui/material";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  useEffect(() => {
    // Handle the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    // Handle the appinstalled event
    const handleAppInstalled = () => {
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    // Handle service worker updates
    const handleServiceWorkerUpdate = () => {
      setShowUpdatePrompt(true);
    };

    // Register event listeners
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check for service worker updates
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleServiceWorkerUpdate);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleServiceWorkerUpdate);
      }
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallPrompt(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleUpdateClick = () => {
    window.location.reload();
  };

  return (
    <>
      <Snackbar
        open={showInstallPrompt}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleInstallClick}>
              Install
            </Button>
          }
        >
          Install Savr as a PWA for a better experience
        </Alert>
      </Snackbar>

      <Snackbar open={showUpdatePrompt} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleUpdateClick}>
              Update
            </Button>
          }
        >
          A new version is available
        </Alert>
      </Snackbar>
    </>
  );
}
