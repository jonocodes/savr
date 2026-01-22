import { useState, useEffect, useCallback } from "react";
import {
  setConfirmationCallback,
  ConfirmationRequest,
  ConfirmationResponse,
} from "~/utils/storage";

export interface SyncConfirmationState {
  isOpen: boolean;
  type: "disconnect" | "connect-with-local-articles" | null;
  articleCount: number;
}

export interface UseSyncConfirmationReturn {
  confirmationState: SyncConfirmationState;
  handleConfirm: () => void;
  handleCancel: () => void;
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

  // Confirm the operation (delete articles or clear data)
  const handleConfirm = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "confirm" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  // Cancel the operation (keep articles)
  const handleCancel = useCallback(() => {
    if (pendingResolve) {
      pendingResolve({ action: "cancel" });
    }
    closeDialog();
  }, [pendingResolve, closeDialog]);

  return {
    confirmationState,
    handleConfirm,
    handleCancel,
  };
}
