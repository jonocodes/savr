import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
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
  Chip,
  Collapse,
} from "@mui/material";
import { ArrowBack as ArrowBackIcon, Preview as PreviewIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, UploadFile as UploadFileIcon } from "@mui/icons-material";
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
import { ingestHtml, ingestPdf } from "lib/src/ingestion";
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
  const [showPreview, setShowPreview] = useState(true);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute the effective content type (detected or manually selected)
  const effectiveContentType = useMemo(() => {
    if (contentType === "auto") {
      return detectedType || "text/plain";
    }
    return contentType;
  }, [contentType, detectedType]);

  // Compute the preview HTML
  const previewHtml = useMemo(() => {
    if (!content.trim()) return "";
    try {
      return convertToHtml(content, effectiveContentType);
    } catch {
      return "";
    }
  }, [content, effectiveContentType]);

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

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const fileName = file.name.toLowerCase();
      const isPdf = fileName.endsWith(".pdf");
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/.test(fileName);

      if (isPdf) {
        // Handle PDF files directly - ingest them without showing in textarea
        setIngestStatus("Ingesting PDF...");
        setUploadedFileName(file.name);
        try {
          const article = await ingestPdf(
            client,
            file,
            `file://${file.name}`,
            (percent: number | null, message: string | null) => {
              if (percent !== null) {
                setIngestStatus(message);
                setIngestPercent(percent);
              }
            }
          );

          await db.articles.put(article);

          setTimeout(() => {
            setIngestStatus(null);
            setIngestPercent(0);
            setUploadedFileName(null);
            navigate({ to: "/" });
          }, 1500);
        } catch (error) {
          console.error("Error ingesting PDF:", error);
          enqueueSnackbar("Error uploading PDF file", { variant: "error" });
          setIngestStatus(null);
          setIngestPercent(0);
          setUploadedFileName(null);
        }
      } else if (isImage) {
        // Handle image files - read as data URL and wrap in HTML
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          // Create a title from the filename (remove extension)
          const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          // Wrap the image in HTML
          const htmlContent = `<title>${title}</title>
<img src="${dataUrl}" alt="${title}" style="max-width: 100%; height: auto;" />`;
          setContent(htmlContent);
          setUploadedFileName(file.name);
          setContentType("text/html");
          setDetectedType("text/html");
        };
        reader.onerror = () => {
          enqueueSnackbar("Error reading image file", { variant: "error" });
        };
        reader.readAsDataURL(file);
      } else {
        // Handle text files (HTML, MD, TXT) - read and show in textarea
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setContent(text);
          setUploadedFileName(file.name);

          // Auto-detect content type based on file extension
          if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
            setContentType("text/html");
            setDetectedType("text/html");
          } else if (fileName.endsWith(".md") || fileName.endsWith(".markdown")) {
            setContentType("text/markdown");
            setDetectedType("text/markdown");
          } else if (fileName.endsWith(".txt")) {
            setContentType("text/plain");
            setDetectedType("text/plain");
          } else {
            // Fallback to auto-detect from content
            setContentType("auto");
            setDetectedType(detectContentType(text));
          }
        };
        reader.onerror = () => {
          enqueueSnackbar("Error reading file", { variant: "error" });
        };
        reader.readAsText(file);
      }

      // Reset file input so the same file can be uploaded again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [client, enqueueSnackbar, navigate]
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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept=".html,.htm,.md,.markdown,.txt,.pdf,.jpg,.jpeg,.png,.gif,.webp"
        onChange={handleFileUpload}
      />

      {/* Content */}
      <Container maxWidth="md" sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="body1">
            Paste content or upload a file (HTML, Markdown, TXT, PDF, or images)
          </Typography>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={ingestStatus !== null}
            size="small"
          >
            Upload File
          </Button>
        </Box>

        {/* Show uploaded file name */}
        {uploadedFileName && !ingestStatus && (
          <Chip
            label={`File: ${uploadedFileName}`}
            onDelete={() => {
              setUploadedFileName(null);
              setContent("");
              setDetectedType(null);
            }}
            size="small"
            sx={{ mb: 1 }}
          />
        )}

        {/* PDF Upload Progress (shown inline) */}
        {ingestStatus && uploadedFileName?.toLowerCase().endsWith(".pdf") && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {ingestStatus} - {uploadedFileName}
            </Typography>
            <LinearProgress variant="determinate" value={ingestPercent} />
          </Box>
        )}

        {/* Content Type Selector */}
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2, flexWrap: "wrap" }}>
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

          {/* Show detected/effective type with a prominent chip */}
          {content.trim() && (
            <Chip
              label={`Will save as: ${CONTENT_TYPE_OPTIONS.find((o) => o.value === effectiveContentType)?.label || effectiveContentType}`}
              color={
                effectiveContentType === "text/html" ? "primary" :
                effectiveContentType === "text/markdown" ? "secondary" :
                "default"
              }
              variant="outlined"
              size="small"
            />
          )}

          {/* Auto-detect indicator */}
          {contentType === "auto" && detectedType && (
            <Typography variant="body2" color="text.secondary">
              (auto-detected)
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
        <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
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
          <Button
            onClick={() => setShowPreview(!showPreview)}
            variant="text"
            startIcon={<PreviewIcon />}
            endIcon={showPreview ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            disabled={!content.trim()}
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
        </Box>

        {/* Live Preview Panel */}
        <Collapse in={showPreview && !!content.trim()}>
          <Paper
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              maxHeight: "400px",
              overflow: "auto",
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PreviewIcon fontSize="small" />
              Live Preview
              {effectiveContentType && (
                <Chip
                  label={CONTENT_TYPE_OPTIONS.find((o) => o.value === effectiveContentType)?.label}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <Box
              sx={{
                mt: 1,
                lineHeight: 1.7,
                "& p": { margin: "0.5em 0" },
                "& ul, & ol": { pl: 2, my: 1 },
                "& li": { mb: 0.5 },
                "& strong": { fontWeight: 600 },
                "& h1": { fontSize: "1.5em", fontWeight: 600, mt: 1, mb: 0.5 },
                "& h2": { fontSize: "1.3em", fontWeight: 600, mt: 1, mb: 0.5 },
                "& h3": { fontSize: "1.15em", fontWeight: 600, mt: 1, mb: 0.5 },
                "& h4, & h5, & h6": { fontWeight: 600, mt: 1, mb: 0.5 },
                "& pre": {
                  bgcolor: "grey.100",
                  p: 1,
                  borderRadius: 1,
                  overflow: "auto",
                  fontFamily: "monospace",
                  fontSize: "0.9em",
                },
                "& code": {
                  bgcolor: "grey.100",
                  px: 0.5,
                  borderRadius: 0.5,
                  fontFamily: "monospace",
                  fontSize: "0.9em",
                },
                "& blockquote": {
                  borderLeft: "3px solid",
                  borderColor: "grey.400",
                  pl: 2,
                  ml: 0,
                  color: "text.secondary",
                },
                "& table": {
                  borderCollapse: "collapse",
                  width: "100%",
                  my: 1,
                },
                "& th, & td": {
                  border: "1px solid",
                  borderColor: "divider",
                  p: 1,
                },
                "& th": {
                  bgcolor: "grey.100",
                  fontWeight: 600,
                },
                "& a": {
                  color: "primary.main",
                },
                "& img": {
                  maxWidth: "100%",
                  height: "auto",
                },
                "& hr": {
                  border: "none",
                  borderTop: "1px solid",
                  borderColor: "divider",
                  my: 2,
                },
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </Paper>
        </Collapse>

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
