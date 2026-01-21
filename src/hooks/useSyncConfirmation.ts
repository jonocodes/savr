import { useState, useEffect, useCallback } from "react";
import {
  setConfirmationCallback,
  ConfirmationRequest,
  ConfirmationResponse,
} from "~/utils/storage";

export interface SyncConfirmationState {
  isOpen: boolean;
  type: "disconnect" | "first-sync-with-local-data" | null;
  articleCount: number;
}

export interface UseSyncConfirmationReturn {
  confirmationState: SyncConfirmationState;
  handleConfirm: () => void;
  handleCancel: () => void;
  handleKeepLocal: () => void;
  handleReplaceWithServer: () => void;
}

/**
 * Hook to handle sync confirmation dialogs.
 * Registers a callback with the storage module and provides state/handlers for UI.
 */
export function useSyncConfirmation(): UseSyncConfirmationReturn {
  const [confirmationState, setConfirmationState] = useState<SyncConfirmationState>({
    isOpen: false,
    type: null,
    articleCount: 0,
  });

  // Store the resolve function to call when user responds
  const [pendingResolve, setPendingResolve] = useState<
    ((response: ConfirmationResponse) => void) | null
  >(null);

  // Register the confirmation callback on mount
  useEffect(() => {
    const callback = async (request: ConfirmationRequest): Promise<ConfirmationResponse> => {
      return new Promise((resolve) => {
        setPendingResolve(() => resolve);
        setConfirmationState({
          isOpen: true,
          type: request.type,
          articleCount: request.articleCount,
        });
      });
    };

    setConfirmationCallback(callback);

    // Cleanup on unmount
    return () => {
      setConfirmationCallback(null);
    };
  }, []);

  const closeDialog = useCallback(() => {
    setConfirmationState({
      isOpen: false,
      type: null,
      articleCount: 0,
    });
    setPendingResolve(null);
  }, []);

  // For disconnect: confirm clearing data
  const handleConfirm = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "confirm" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  // For both: cancel the operation
  const handleCancel = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "cancel" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  // For first-sync: keep local articles
  const handleKeepLocal = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "keep-local" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  // For first-sync: replace with server data
  const handleReplaceWithServer = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "replace-with-server" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  return {
    confirmationState,
    handleConfirm,
    handleCancel,
    handleKeepLocal,
    handleReplaceWithServer,
  };
}
