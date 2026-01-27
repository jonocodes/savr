import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
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
} from "@mui/material";
import { ArrowBack as ArrowBackIcon } from "@mui/icons-material";
import {
  AFTER_EXTERNAL_SAVE_ACTIONS,
  AfterExternalSaveAction,
  getAfterExternalSaveFromCookie,
} from "~/utils/cookies";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import { ingestHtml } from "lib/src/ingestion";
import type { Article } from "lib/src/models";

export default function SubmitScreen() {
  const { enqueueSnackbar } = useSnackbar();

  const [dialogVisible, setDialogVisible] = useState(false);

  const [html, setHtml] = useState<string>("");
  const [ingestPercent, setIngestPercent] = useState<number>(0);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

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

      // Wait until URL is not empty
      if (!html.trim()) {
        return;
      }

      setIngestStatus("Ingesting...");
      try {
        const result = await ingestHtml(
          client,
          // corsProxy,
          html,
          "text/html",
          null,
          (percent: number | null, message: string | null) => {
            if (percent !== null) {
              setIngestStatus(message);
              setIngestPercent(percent);
            }
          }
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
          setHtml("");

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
      html,
      setDialogVisible,
      setIngestStatus,
      setIngestPercent,
      setHtml,
      enqueueSnackbar,
      navigate,
    ]
  );

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
        Paste your HTML here
        <TextField
          multiline
          minRows={10}
          // inputRef={htmlFieldRef}
          label="text"
          onChange={(e) => setHtml(e.target.value)}
          fullWidth
          margin="normal"
          autoFocus
          disabled={ingestStatus !== null}
          defaultValue={
            "<title>Ipsum</title><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum</p>"
          }
        />
        <Button
          onClick={() => saveHtml()}
          variant="contained"
          disabled={ingestStatus !== null || !html.trim()}
        >
          Save
        </Button>
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
