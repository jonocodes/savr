import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import {
  Box,
  TextField,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import {
  AFTER_EXTERNAL_SAVE_ACTIONS,
  AfterExternalSaveAction,
  getSummaryProviderFromCookie,
  getSummaryModelFromCookie,
  getApiKeyForProvider,
  getSummarySettingsFromCookie,
} from "~/utils/cookies";
import {
  summarizeText,
  DEFAULT_SUMMARY_SETTINGS,
  type SummarizationProgress,
  type SummaryProvider,
} from "~/utils/summarization";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import { ingestHtml } from "lib/src/ingestion";
import type { Article } from "lib/src/models";
import {
  detectContentType,
  convertToHtml,
  CONTENT_TYPE_OPTIONS,
  type ContentTypeOption,
} from "lib/src/contentType";

export default function SubmitScreen() {
  const { enqueueSnackbar } = useSnackbar();

  const [dialogVisible, setDialogVisible] = useState(false);

  const [content, setContent] = useState<string>("");
  const [contentType, setContentType] = useState<ContentTypeOption>("auto");
  const [detectedType, setDetectedType] = useState<"text/html" | "text/markdown" | "text/plain" | null>(null);
  const [ingestPercent, setIngestPercent] = useState<number>(0);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [testSummary, setTestSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [_summaryProgress, setSummaryProgress] = useState<SummarizationProgress | null>(null);

  // Add message listener for browser extension
  useEffect(() => {
    console.log("Setting up message listener in SubmitScreen");
    // Handshake: notify extension/content script that page is ready
    window.postMessage({ type: "READY_FOR_EXTENSION" }, "*");
    const handleMessage = (event: MessageEvent) => {
      console.log("SubmitScreen received message:", event.data);
      if (event.data && event.data.type === "FROM_EXTENSION") {
        console.log("Valid extension message received:", event.data.message);
        alert(event.data.message);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => window.removeEventListener("message", handleMessage);
  }, []);
  const navigate = useNavigate();
  const router = useRouter();
  console.log("Current route:", router.basepath);
  const { client } = useRemoteStorage();
  // const router = useRouter();
  // console.log("Current route:", router.location.pathname);
  // const navigate = useNavigate();

  const handleBack = () => {
    navigate({ to: "/" });
  };

  // Note: HTML content from browser extension is now handled by the content script
  // The content script will directly populate the textarea when the extension sends data

  const saveHtml = useCallback(
    async (afterExternalSave: AfterExternalSaveAction = AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST) => {
      // TODO: pass in headers/cookies for downloading

      // Wait until content is not empty
      if (!content.trim()) {
        return;
      }

      setIngestStatus("Ingesting...");
      try {
        // Determine the actual content type
        const actualContentType: "text/html" | "text/markdown" | "text/plain" =
          contentType === "auto" ? detectContentType(content) : contentType;

        // Convert content to HTML if needed
        const htmlContent = convertToHtml(content, actualContentType);

        const result = await ingestHtml(
          client,
          // corsProxy,
          htmlContent,
          "text/html", // Always save as HTML since we convert
          null,
          (percent: number | null, message: string | null) => {
            if (percent !== null) {
              setIngestStatus(message);
              setIngestPercent(percent);
            }
          },
        );

        const article: Article = result.article;
        console.log("About to save article to IndexedDB:", article);
        await db.articles.put(article);
        console.log("Article saved to IndexedDB successfully");

        // Verify the article was actually saved
        const savedArticle = await db.articles.get(article.slug);
        console.log("Retrieved saved article from IndexedDB:", savedArticle);

        // Force a database refresh by triggering a re-query
        await db.articles.toArray();

        // enqueueSnackbar(`Article saved successfully! Slug: ${article.slug}`, {
        //   variant: "success",
        // });

        // wait a bit before closing the dialog
        setTimeout(() => {
          setDialogVisible(false);
          setIngestStatus(null);
          setIngestPercent(0);
          setContent("");
          setDetectedType(null);

          console.log("afterExternalSave", afterExternalSave);

          // Handle different after-save actions based on preference
          if (afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB) {
            // Close the tab (used by bookmarklet)
            window.close();
          } else if (afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE) {
            // Navigate to the article page
            navigate({ to: `/article/${article.slug}` });
          } else if (afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST) {
            // Navigate to the article list page
            navigate({ to: "/" });
          }
        }, 1500);
      } catch (error) {
        console.error(error);
        enqueueSnackbar("Error requesting article", { variant: "error" });
        setIngestStatus(null);
        setIngestPercent(0);
      }
    },
    [
      client,
      content,
      contentType,
      setDialogVisible,
      setIngestStatus,
      setIngestPercent,
      setContent,
      setDetectedType,
      enqueueSnackbar,
      navigate,
    ],
  );

  const handleTestSummary = async () => {
    if (!content.trim()) {
      enqueueSnackbar("Please enter some content first", { variant: "warning" });
      return;
    }

    // Get summarization config from cookies
    const provider = getSummaryProviderFromCookie() as SummaryProvider;
    const model = getSummaryModelFromCookie();
    const apiKey = getApiKeyForProvider(provider);

    if (!apiKey) {
      enqueueSnackbar("Please set up your API key in Preferences", { variant: "warning" });
      return;
    }

    setIsSummarizing(true);
    setTestSummary(null);
    setSummaryProgress({ status: "summarizing" });

    try {
      // Determine the actual content type and convert if needed
      const actualContentType: "text/html" | "text/markdown" | "text/plain" =
        contentType === "auto" ? detectContentType(content) : contentType;
      const htmlContent = convertToHtml(content, actualContentType);

      // Extract text from HTML for summarization
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const plainText = doc.body.textContent || "";

      if (plainText.length < 100) {
        enqueueSnackbar("Content is too short to summarize", { variant: "warning" });
        setIsSummarizing(false);
        setSummaryProgress(null);
        return;
      }

      const cookieSettings = getSummarySettingsFromCookie();
      const settings = {
        ...DEFAULT_SUMMARY_SETTINGS,
        detailLevel: cookieSettings.detailLevel as typeof DEFAULT_SUMMARY_SETTINGS.detailLevel,
        tone: cookieSettings.tone as typeof DEFAULT_SUMMARY_SETTINGS.tone,
        focus: cookieSettings.focus as typeof DEFAULT_SUMMARY_SETTINGS.focus,
        format: cookieSettings.format as typeof DEFAULT_SUMMARY_SETTINGS.format,
        customPrompt: cookieSettings.customPrompt,
      };

      const summary = await summarizeText(
        plainText,
        settings,
        provider,
        apiKey,
        model,
        (progress) => {
          setSummaryProgress(progress);
        },
      );

      setTestSummary(summary);
      setSummaryProgress(null);
    } catch (error) {
      console.error("Failed to generate test summary:", error);
      enqueueSnackbar("Failed to generate summary", { variant: "error" });
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <Box sx={{ flexGrow: 1, backgroundColor: "background.default" }}>
      {/* Header */}
      <AppBar
        sx={{
          // display: "flex",
          position: "sticky",
          top: 0,
          zIndex: 1000,
          // backgroundColor: "background.paper",
        }}
      >
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={handleBack} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Save raw content
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Container maxWidth="md" sx={{ mt: 2 }}>
        <Typography variant="body1" gutterBottom>
          Paste your content here (HTML, Markdown, or plain text)
        </Typography>

        {/* Content Type Selector */}
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="content-type-label">Content Type</InputLabel>
            <Select
              labelId="content-type-label"
              id="content-type-select"
              value={contentType}
              label="Content Type"
              onChange={(e) => setContentType(e.target.value as ContentTypeOption)}
              disabled={ingestStatus !== null}
            >
              {CONTENT_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Show detected type when auto-detect is selected */}
          {contentType === "auto" && detectedType && (
            <Typography variant="body2" color="text.secondary">
              Detected: {CONTENT_TYPE_OPTIONS.find((o) => o.value === detectedType)?.label || detectedType}
            </Typography>
          )}
        </Box>

        <TextField
          multiline
          minRows={10}
          label="Content"
          value={content}
          onChange={(e) => {
            const newContent = e.target.value;
            setContent(newContent);
            // Auto-detect content type as user types
            if (newContent.trim()) {
              setDetectedType(detectContentType(newContent));
            } else {
              setDetectedType(null);
            }
          }}
          fullWidth
          margin="normal"
          autoFocus
          disabled={ingestStatus !== null}
          placeholder="Paste HTML, Markdown, or plain text content here..."
        />
        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Button
            onClick={() => saveHtml()}
            variant="contained"
            disabled={ingestStatus !== null || !content.trim()}
          >
            Save
          </Button>
          <Button
            onClick={handleTestSummary}
            variant="outlined"
            disabled={isSummarizing || !content.trim()}
          >
            {isSummarizing ? "Summarizing..." : "Test Summary"}
          </Button>
        </Box>
        {/* Summary Progress */}
        {isSummarizing && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Generating summary...
            </Typography>
            <LinearProgress />
          </Box>
        )}
        {/* Test Summary Result */}
        {testSummary && (
          <Paper sx={{ mt: 2, p: 2, bgcolor: "background.paper" }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Generated Summary:
            </Typography>
            <Box
              sx={{
                lineHeight: 1.7,
                "& p": { margin: "0.5em 0" },
                "& ul, & ol": { pl: 2, my: 1 },
                "& li": { mb: 0.5 },
                "& strong": { fontWeight: 600 },
                "& h1, & h2, & h3, & h4": { mt: 1.5, mb: 0.5, fontWeight: 600 },
              }}
            >
              <ReactMarkdown>{testSummary}</ReactMarkdown>
            </Box>
          </Paper>
        )}
      </Container>

      {/* Add Article Dialog */}
      <Dialog open={dialogVisible} onClose={() => setDialogVisible(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Article</DialogTitle>
        <DialogContent>
          {ingestPercent > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {ingestStatus}
              </Typography>
              <LinearProgress variant="determinate" value={ingestPercent} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogVisible(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
