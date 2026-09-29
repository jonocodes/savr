import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { getFailureReportRepo } from "~/config/environment";
import {
  buildIssueUrl,
  parseFailureReportPayload,
  type FailureReportPayload,
} from "~/utils/failureReport";

interface FailureReportDialogProps {
  payload: FailureReportPayload;
  onClose: () => void;
}

/**
 * Offers to file a public GitHub issue for an article that failed to load.
 * The payload is shown pretty-printed and is editable; "File on GitHub" opens
 * a prefilled new-issue form in a new tab. Savr itself makes no request.
 */
export default function FailureReportDialog({ payload, onClose }: FailureReportDialogProps) {
  const [text, setText] = useState(() => JSON.stringify(payload, null, 2));

  // A new failure resets any edits from a previous report.
  useEffect(() => {
    setText(JSON.stringify(payload, null, 2));
  }, [payload]);

  const parsed = useMemo(() => parseFailureReportPayload(text), [text]);
  const issueUrl = useMemo(
    () => (parsed ? buildIssueUrl(getFailureReportRepo(), parsed) : undefined),
    [parsed],
  );

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="failure-report-title"
      data-testid="failure-report-dialog"
    >
      <DialogTitle id="failure-report-title">Report this failed article?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Savr couldn&apos;t load this page. Filing a report helps get failures like this fixed.
        </Typography>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">What gets shared</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Reports are public GitHub issues posted under your account. Edit anything you
                don&apos;t want to share.
              </Typography>
              <TextField
                multiline
                fullWidth
                minRows={8}
                maxRows={16}
                value={text}
                onChange={(event) => setText(event.target.value)}
                error={parsed === null}
                helperText={
                  parsed === null
                    ? "Report details must be valid JSON with a full http(s) url"
                    : undefined
                }
                inputProps={{ "data-testid": "failure-report-payload", spellCheck: false }}
                sx={{ "& textarea": { fontFamily: "monospace", fontSize: 12 } }}
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, display: "block" }}>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button onClick={onClose} data-testid="failure-report-dismiss">
            Not now
          </Button>
          <Button
            variant="contained"
            component="a"
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            disabled={parsed === null}
            onClick={onClose}
            data-testid="failure-report-file"
          >
            File on GitHub
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Filing needs a GitHub account. You&apos;ll be notified when it&apos;s fixed.
        </Typography>
      </DialogActions>
    </Dialog>
  );
}
