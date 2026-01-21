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
            Keep Local Data
          </Button>
          <Button onClick={handleConfirm} color="error" variant="contained">
            Disconnect & Clear Local Data
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (type === "sync-would-delete-articles") {
    return (
      <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Local Articles Not Found on Server</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{articleCount} article{articleCount !== 1 ? "s" : ""}</strong>{" "}
            {articleCount !== 1 ? "exist" : "exists"} locally but not on the remote server.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            This could mean:
          </DialogContentText>
          <DialogContentText component="ul" sx={{ mt: 1, pl: 2 }}>
            <li>
              <strong>They were deleted on another device</strong> - choose "Remove" to sync the
              deletion
            </li>
            <li>
              <strong>They were saved offline and never synced</strong> - choose "Keep" to
              preserve them
            </li>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} color="primary" variant="contained">
            Keep Local Articles
          </Button>
          <Button onClick={handleConfirm} color="error">
            Remove Local Articles
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
}
