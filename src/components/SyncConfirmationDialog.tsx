import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import { useSyncConfirmation } from "~/hooks/useSyncConfirmation";

/**
 * Dialog component that shows confirmation prompts for sync operations.
 * Should be rendered at the app root level to handle confirmations globally.
 */
export function SyncConfirmationDialog() {
  const { confirmationState, handleConfirm, handleCancel } = useSyncConfirmation();

  const { isOpen, type, articleCount } = confirmationState;

  if (type === "disconnect") {
    return (
      <Dialog open={isOpen} onClose={handleCancel}>
        <DialogTitle>Disconnect from Sync?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            All {articleCount} article{articleCount !== 1 ? "s" : ""} will be removed from this
            device. Reconnect to get them back.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleConfirm} color="error" variant="contained">
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (type === "connect-with-local-articles") {
    return (
      <Dialog open={isOpen} onClose={handleCancel}>
        <DialogTitle>Turn on Sync?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Turning on sync will replace your {articleCount} locally saved article
            {articleCount !== 1 ? "s" : ""} with articles from the server.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleConfirm} color="primary" variant="contained">
            Turn on Sync
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
}
