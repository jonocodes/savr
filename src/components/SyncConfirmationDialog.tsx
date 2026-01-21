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
  const {
    confirmationState,
    handleConfirm,
    handleCancel,
    handleKeepLocal,
    handleReplaceWithServer,
  } = useSyncConfirmation();

  const { isOpen, type, articleCount } = confirmationState;

  if (type === "disconnect") {
    return (
      <Dialog open={isOpen} onClose={handleCancel}>
        <DialogTitle>Disconnect from Remote Storage?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have <strong>{articleCount} article{articleCount !== 1 ? "s" : ""}</strong> saved
            locally. Disconnecting will remove all local articles from this device.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            Your articles will remain on the remote server and can be synced again when you
            reconnect.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleConfirm} color="error" variant="contained">
            Disconnect & Clear Local Data
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (type === "first-sync-with-local-data") {
    return (
      <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
        <DialogTitle>First Time Connecting with Local Articles</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have <strong>{articleCount} article{articleCount !== 1 ? "s" : ""}</strong> saved
            locally that {articleCount !== 1 ? "have" : "has"} not been synced to remote storage
            before.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            How would you like to handle your local articles?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ flexDirection: "column", alignItems: "stretch", gap: 1, p: 2 }}>
          <Button
            onClick={handleKeepLocal}
            color="primary"
            variant="contained"
            fullWidth
          >
            Keep Local Articles (Recommended)
          </Button>
          <Button
            onClick={handleReplaceWithServer}
            color="warning"
            variant="outlined"
            fullWidth
          >
            Replace with Server Data
          </Button>
          <Button onClick={handleCancel} color="inherit" fullWidth>
            Cancel & Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
}
