import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  buildFailureReportIssueUrl,
  formatFailureReportPayload,
  parseFailureReportPayload,
  type FailureReportPayload,
} from "~/utils/reporting/failureReport";

interface FailureReportDialogProps {
  open: boolean;
  onClose: () => void;
  payload: FailureReportPayload | null;
  repo: string;
}

export default function FailureReportDialog({
  open,
  onClose,
  payload,
  repo,
}: FailureReportDialogProps) {
  // null means "not edited yet": the text always derives from the payload
  // until the user touches it, and is reset when the dialog finishes closing.
  const [editedDetails, setEditedDetails] = useState<string | null>(null);
  const details =
    editedDetails ?? (payload ? formatFailureReportPayload(payload) : "");

  const parsed = useMemo(() => parseFailureReportPayload(details), [details]);
  const issueUrl = parsed.ok ? buildFailureReportIssueUrl(repo, parsed.payload) : "";
  const parseError = parsed.ok ? null : parsed.error;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onExited: () => setEditedDetails(null) }}
    >
      <DialogTitle>Report this failed article?</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          Savr couldn&apos;t load this page. Filing a report helps get failures like this fixed.
        </Typography>

        <Accordion disableGutters sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>What gets shared</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Reports are public GitHub issues posted under your account. Edit anything you
              don&apos;t want to share.
            </Typography>
            <TextField
              value={details}
              onChange={(e) => setEditedDetails(e.target.value)}
              multiline
              minRows={8}
              maxRows={16}
              fullWidth
              error={parseError !== null}
              helperText={parseError ?? " "}
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.75rem" } }}
            />
          </AccordionDetails>
        </Accordion>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          Filing needs a GitHub account. You&apos;ll be notified when it&apos;s fixed.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Not now</Button>
        <Button
          variant="contained"
          component="a"
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          disabled={issueUrl === ""}
        >
          File on GitHub
        </Button>
      </DialogActions>
    </Dialog>
  );
}
