import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  Tooltip,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Container,
  Paper,
} from "@mui/material";
import {
  AddCircle as AddIcon,
  MoreVert as MoreVertIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Article as ArticleIcon,
  Archive as ArchiveIcon2,
  ArrowForward,
  CloudQueue as CloudQueueIcon,
  CloudOff as CloudOffIcon,
} from "@mui/icons-material";
import { db } from "~/utils/db";
import { ingestUrl, ingestHtml } from "../../lib/src/ingestion";
import { removeArticle, updateArticleMetadata, loadThumbnail } from "~/utils/tools";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSyncStatus } from "./SyncStatusProvider";
import { useLiveQuery } from "dexie-react-hooks";
import { Article } from "../../lib/src/models";
import { useSnackbar } from "notistack";
import { isDebugMode } from "~/config/environment";
import { generateInfoForCard, getFilePathContent } from "../../lib/src/lib";
import { getAfterExternalSaveFromCookie } from "~/utils/cookies";
import { AFTER_EXTERNAL_SAVE_ACTIONS, AfterExternalSaveAction } from "~/utils/cookies";
import { shouldShowWelcome } from "../config/environment";

import { keyframes } from "@mui/system";

const sampleArticleUrls = [
  "https://www.apalrd.net/posts/2023/network_ipv6/",
  "https://getpocket.com/explore/item/is-matter-conscious",
  "https://medium.com/androiddevelopers/jetnews-for-every-screen-4d8e7927752",
  "https://theconversation.com/records-of-pompeiis-survivors-have-been-found-and-archaeologists-are-starting-to-understand-how-they-rebuilt-their-lives-230641",
  "https://en.m.wikipedia.org/wiki/Dune:_Part_Two",
  "https://lifehacker.com/home/how-to-make-more-kitchen-counter-space",
  "http://leejo.github.io/2024/09/01/off_by_one/",
  "https://www.troyhunt.com/inside-the-3-billion-people-national-public-data-breach/",
  "https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881",
  "https://leejo.github.io/2024/09/29/holding_out_for_the_heros_to_fuck_off/",
  "https://www.cbc.ca/news/canada/nova-scotia/1985-toyota-tercel-high-mileage-1.7597168",
];

function ArticleItem({ article }: { article: Article }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [thumbnailSrc, setThumbnailSrc] = useState<string>("/static/article_bw.webp");
  const [contentExists, setContentExists] = useState<boolean>(true);

  const storage = useRemoteStorage();

  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    const loadThumbnailData = async () => {
      try {
        const thumbnailData = await loadThumbnail(article.slug);
        setThumbnailSrc(thumbnailData);
      } catch (error) {
        console.warn(`Failed to load thumbnail for ${article.slug}:`, error);
        // Keep the fallback image
      }
    };

    // TODO: load these lazily perhaps so it does not grind to a halt

    loadThumbnailData();
  }, []);

  useEffect(() => {
    const checkContentExists = async () => {
      if (!storage.client) return;

      try {
        const contentPath = getFilePathContent(article.slug);
        const file = (await storage.client.getFile(contentPath)) as { data: string } | null;
        setContentExists(!!(file && file.data));
      } catch (error) {
        console.warn(`Failed to check content for ${article.slug}:`, error);
        setContentExists(false);
      }
    };

    checkContentExists();
  }, [article.slug, storage.client]);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation(); // Prevent the ListItem click from firing
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleShare = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (article.url) {
      navigator.clipboard.writeText(article.url);
      alert("Url copied to clipboard: " + article.url);
    }
    closeMenu();
  };

  const handleArchive = (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      // updateArticleState(storage.client!, article.slug, "archived");
      updateArticleMetadata(storage.client!, { ...article, state: "archived" });
      enqueueSnackbar("Article archived");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to archive article", { variant: "error" });
    }
    closeMenu();
  };

  const handleUnarchive = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!article) throw new Error("Article is undefined");

    try {
      // updateArticleState(storage.client!, article.slug, "unread");
      updateArticleMetadata(storage.client!, { ...article, state: "unread" });
      enqueueSnackbar("Article unarchived");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to unarchive article", { variant: "error" });
    }
    closeMenu();
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await removeArticle(storage.client!, article.slug);
      enqueueSnackbar("Article deleted");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to delete article", { variant: "error" });
    }
    closeMenu();
  };

  return (
    <ListItem
      sx={{
        // borderBottom: "1px solid",
        // borderColor: "divider",
        "&:hover": {
          backgroundColor: "action.hover",
        },
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 0.5,
        alignItems: "flex-start",
      }}
      onClick={() => navigate({ to: "/article/$slug", params: { slug: article.slug } })}
    >
      <ListItemAvatar>
        <img
          src={thumbnailSrc}
          alt="Article"
          style={{ width: 100, height: 100, objectFit: "cover" }}
        />
      </ListItemAvatar>
      <ListItemText
        sx={{
          marginLeft: 2,
        }}
        primary={
          <Typography variant="body1" sx={{ fontWeight: "bold", fontSize: "1rem" }}>
            {article.title}
          </Typography>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {contentExists ? generateInfoForCard(article) : "(content missing)"}
          </Typography>
        }
      />
      <IconButton onClick={openMenu} data-testid="article-menu-button">
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        data-testid="article-menu"
      >
        {article.state === "archived" ? (
          <MenuItem onClick={handleUnarchive}>
            <ListItemIcon>
              <UnarchiveIcon fontSize="small" />
            </ListItemIcon>
            Unarchive
          </MenuItem>
        ) : (
          <MenuItem onClick={handleArchive}>
            <ListItemIcon>
              <ArchiveIcon fontSize="small" />
            </ListItemIcon>
            Archive
          </MenuItem>
        )}
        <MenuItem onClick={handleShare}>
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          Share
        </MenuItem>
        <MenuItem onClick={handleDelete} data-testid="article-menu-delete">
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </ListItem>
  );
}

export default function ArticleListScreen() {
  const navigate = useNavigate();

  const [dialogVisible, setDialogVisible] = useState(false);
  const urlFieldRef = useRef<HTMLInputElement>(null);

  const articles = useLiveQuery(() => {
    console.log("useLiveQuery triggered - fetching articles from IndexedDB");
    return db.articles.orderBy("ingestDate").reverse().toArray();
  });

  // Count unread articles for the button label
  const unreadCount = useLiveQuery(() => {
    return db.articles.where("state").equals("unread").count();
  });

  // Count archived articles for the button label
  const archivedCount = useLiveQuery(() => {
    return db.articles.where("state").equals("archived").count();
  });

  const [filter, setFilter] = useState<"unread" | "archived">("unread");
  const [url, setUrl] = useState<string>("");
  const [ingestPercent, setIngestPercent] = useState<number>(0);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const { remoteStorage, client, widget } = useRemoteStorage();
  const { enqueueSnackbar } = useSnackbar();
  const { status: syncStatus, isPWA } = useSyncStatus();

  // Track if we've shown the initial load message
  const hasShownInitialLoad = useRef(false);

  // Add visual debugging for article count
  useEffect(() => {
    if (articles && !hasShownInitialLoad.current) {
      console.log(`Articles loaded: ${articles.length} total articles`);
      // enqueueSnackbar(`Loaded ${articles.length} articles`, {
      //   variant: "info",
      //   autoHideDuration: 2000,
      // });
      hasShownInitialLoad.current = true;
    }
  }, [articles]);

  // Redirect to home page with welcome URL if no articles exist
  useEffect(() => {
    if (articles && articles.length === 0 && shouldShowWelcome()) {
      navigate({
        to: "/",
        search: {
          saveUrl: "https://github.com/jonocodes/savr/wiki/Welcome-to-Savr",
          autoSubmit: "false",
        },
      });
    }
  }, [articles, navigate]);

  useEffect(() => {
    const handleTripleTap = () => {
      navigate({ to: "/diagnostics" });
    };

    let tapCount = 0;
    let tapTimer: NodeJS.Timeout;

    const handleTap = () => {
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        if (tapCount >= 3) {
          handleTripleTap();
        }
        tapCount = 0;
      }, 500);
    };

    document.addEventListener("click", handleTap);
    return () => document.removeEventListener("click", handleTap);
  }, []);

  useEffect(() => {
    const bookmarklet = new URLSearchParams(window.location.search).get("bookmarklet");

    if (!bookmarklet) {
      return;
    }

    const decodedUrl = decodeURIComponent(bookmarklet);
    setUrl(decodedUrl);
    setDialogVisible(true);
    setIngestStatus("Waiting for page to load...");
    setIngestPercent(0);

    let ingesting = false;

    const handler = async (event: MessageEvent) => {
      if (event.data.action === "savr-html") {
        if (ingesting) {
          return;
        }
        ingesting = true;
        setIngestStatus("Ingesting...");
        setIngestPercent(10);
        const { article } = await ingestHtml(
          client,
          event.data.html,
          "text/html",
          event.data.url,
          (percent: number | null, message: string | null) => {
            if (percent !== null) {
              setIngestStatus(message);
              setIngestPercent(percent);
            }
          }
        );

        await db.articles.put(article);

        setTimeout(() => {
          setDialogVisible(false);
          setIngestStatus(null);
          setIngestPercent(100);
          setUrl("");
          window.close();
        }, 1500);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [client]);

  const saveUrl = useCallback(
    async (afterExternalSave: AfterExternalSaveAction = AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST) => {
      // TODO: pass in headers/cookies for downloading

      // Wait until URL is not empty
      if (!url.trim()) {
        return;
      }

      setIngestStatus("Ingesting...");
      try {
        const article = await ingestUrl(
          client,
          // corsProxy,
          url,
          (percent: number | null, message: string | null) => {
            if (percent !== null) {
              setIngestStatus(message);
              setIngestPercent(percent);
            }
          }
        );

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
          setUrl("");

          console.log("afterExternalSave", afterExternalSave);

          // Handle different after-save actions based on preference
          if (afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB) {
            // Close the tab (used by bookmarklet)
            window.close();
          } else if (afterExternalSave === AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE) {
            // Navigate to the article page
            navigate({ to: `/article/${article.slug}` });
          }
          // If "show-list", do nothing - just stay on the current page
        }, 1500);
      } catch (error) {
        console.error(error);
        enqueueSnackbar("Error requesting article", { variant: "error" });
        setIngestStatus(null);
        setIngestPercent(0);
        setDialogVisible(false);
        setUrl("");
      }
    },
    [
      client,
      url,
      setDialogVisible,
      setIngestStatus,
      setIngestPercent,
      setUrl,
      enqueueSnackbar,
      navigate,
    ]
  );

  // Handle saveUrl query parameter
  // Supports autoSubmit parameter:
  // - autoSubmit=true (default): Automatically submit the form after opening the dialog
  // - autoSubmit=false: Open the dialog but don't auto-submit, let user review/edit first
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const saveUrlParam = urlParams.get("saveUrl");
    const autoSubmitParam = urlParams.get("autoSubmit");

    if (saveUrlParam && client) {
      // Decode the URL parameter
      const decodedUrl = decodeURIComponent(saveUrlParam);
      setUrl(decodedUrl);
      setDialogVisible(true);

      // Parse autoSubmit as boolean, default to true if not specified
      // URL parameters are always strings, so we check for the string "false"
      // Handle case where it might be double-quoted like '"false"'
      const shouldAutoSubmit = autoSubmitParam !== "false" && autoSubmitParam !== '"false"';

      if (shouldAutoSubmit) {
        // Automatically submit the form after a short delay to ensure the dialog is open
        setTimeout(() => {
          // Remove the saveUrl and autoSubmit parameters from the URL before submitting
          const currentUrlParams = new URLSearchParams(window.location.search);
          currentUrlParams.delete("saveUrl");
          currentUrlParams.delete("autoSubmit");
          const newSearch = currentUrlParams.toString();
          const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
          window.history.replaceState({}, "", newUrl);

          // Use the user's preference for after-save action
          const afterExternalSave = getAfterExternalSaveFromCookie();
          saveUrl(afterExternalSave);
        }, 100);
      } else {
        // Just remove the parameters from the URL without auto-submitting
        setTimeout(() => {
          const currentUrlParams = new URLSearchParams(window.location.search);
          currentUrlParams.delete("saveUrl");
          currentUrlParams.delete("autoSubmit");
          const newSearch = currentUrlParams.toString();
          const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
          window.history.replaceState({}, "", newUrl);
        }, 100);
      }
    }
  }, [client, saveUrl]); // Only run when client is available

  // Ensure the TextField is focused when the dialog opens
  useEffect(() => {
    if (dialogVisible) {
      setTimeout(() => {
        urlFieldRef.current?.focus();
      }, 100);
    }
  }, [dialogVisible]);

  const filteredArticles = articles ? articles.filter((article) => article.state === filter) : [];

  const pulse = keyframes`
    0% { transform: translateX(0) scale(1); opacity: 1; }
    50% { transform: translateX(10px) scale(1.2); opacity: 0.7; }
    100% { transform: translateX(0) scale(1); opacity: 1; }
  `;

  return (
    <Box sx={{ flexGrow: 1, backgroundColor: "background.default" }}>
      {/* Header */}
      <Paper
        elevation={1}
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          gap: 2,
          position: "sticky",
          top: 0,
          zIndex: 1000,
          backgroundColor: "background.paper",
        }}
      >
        <Tooltip title="Add article">
          <IconButton
            onClick={() => {
              setDialogVisible(true);
              if (isDebugMode()) {
                setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
              }
            }}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center" }}>
          <ToggleButtonGroup
            value={filter}
            exclusive
            onChange={(_, newFilter) => {
              if (newFilter !== null) {
                setFilter(newFilter);
              }
            }}
            size="small"
          >
            <ToggleButton value="unread">
              <ArticleIcon sx={{ mr: 1, display: { xs: "none", sm: "inline-block" } }} />
              Saves{unreadCount !== undefined ? ` (${unreadCount})` : ""}
            </ToggleButton>
            <ToggleButton value="archived">
              <ArchiveIcon2 sx={{ mr: 1, display: { xs: "none", sm: "inline-block" } }} />
              Archive{archivedCount !== undefined ? ` (${archivedCount})` : ""}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Tooltip title="Settings">
          <IconButton onClick={() => navigate({ to: "/prefs" })}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Content */}
      <Container
        maxWidth="sm"
        sx={{ mt: 2, mx: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        {filteredArticles.length > 0 ? (
          // TODO: make this a stack if I want spacing between items
          <List>
            {filteredArticles.map((article) => (
              <ArticleItem key={article.slug} article={article} />
            ))}
          </List>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "50vh",
              textAlign: "center",
            }}
          >
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {filter === "unread"
                ? "Start saving articles to see them here"
                : "No archived articles yet"}
            </Typography>

            {filter === "unread" ? (
              <Button
                variant="contained"
                type="submit"
                onClick={() => {
                  setDialogVisible(true);
                  if (isDebugMode()) {
                    setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
                  }
                }}
                sx={{ mt: 2 }}
              >
                Add Article
              </Button>
            ) : (
              <></>
            )}
          </Box>
        )}
      </Container>

      {/* Add Article Dialog */}
      <Dialog open={dialogVisible} onClose={() => setDialogVisible(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Article</DialogTitle>
        <DialogContent>
          <TextField
            inputRef={urlFieldRef}
            label="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            margin="normal"
            autoFocus
            disabled={ingestStatus !== null}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && ingestStatus === null) {
                e.preventDefault();
                saveUrl();
              }
            }}
          />

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
          {articles && articles.length > 0 && (
            <Button onClick={() => setDialogVisible(false)}>Cancel</Button>
          )}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
            {articles && articles.length === 0 && (
              <Typography
                variant="h6"
                sx={{
                  color: "primary.main",
                  fontWeight: "bold",
                }}
              >
                Click here
              </Typography>
            )}
            {articles && articles.length === 0 && (
              <ArrowForward
                sx={{
                  color: "primary.main",
                  fontSize: 32,
                  animation: `${pulse} 1.5s infinite`,
                  // transform: "rotate(90deg)",
                  marginRight: 2,
                }}
              />
            )}
            <Button
              onClick={() => saveUrl()}
              variant="contained"
              disabled={ingestStatus !== null || !url.trim()}
            >
              Save
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button */}
      {/* <Fab
          color="primary"
          aria-label="add"
          sx={{
            position: "fixed",
            bottom: 16,
            right: 16,
          }}
          onClick={() => {
            setDialogVisible(true);
            setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
          }}
        >
          <AddIcon />
        </Fab> */}

      {/* Sync Status Indicator - Only show in PWA mode and when sync is not disabled */}
      {isPWA && syncStatus !== "disabled" && (
        <Tooltip
          title={
            syncStatus === "active"
              ? "Sync active"
              : syncStatus === "paused"
              ? "Sync paused (WiFi only - currently on cellular)"
              : ""
          }
        >
          <Box
            sx={{
              position: "fixed",
              bottom: 16,
              left: 16,
              zIndex: 1000,
              backgroundColor: "background.paper",
              borderRadius: "50%",
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: 3,
              border: "2px solid",
              borderColor: syncStatus === "active" ? "success.main" : "warning.main",
            }}
          >
            {syncStatus === "active" ? (
              <CloudQueueIcon
                sx={{
                  color: "success.main",
                  fontSize: 32,
                }}
              />
            ) : (
              <CloudOffIcon
                sx={{
                  color: "warning.main",
                  fontSize: 32,
                }}
              />
            )}
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}
