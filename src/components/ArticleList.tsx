import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  IconButton,
  Fab,
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
  Avatar,
  Card,
  CardContent,
  Container,
  Paper,
  Stack,
} from "@mui/material";
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Article as ArticleIcon,
  Archive as ArchiveIcon2,
} from "@mui/icons-material";
import extensionConnector from "~/utils/extensionConnector";
import { db } from "~/utils/db";
import { ingestUrl2 } from "../../lib/src/ingestion";
import { removeArticle, getCorsProxyValue, updateArticleMetadata } from "~/utils/tools";
import { useRemoteStorage } from "./RemoteStorageProvider";

import { useLiveQuery } from "dexie-react-hooks";
import { Article } from "../../lib/src/models";
import { useSnackbar } from "notistack";
import { shouldEnableSampleUrls } from "~/config/environment";

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
];

function ArticleItem({ article }: { article: Article }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const storage = useRemoteStorage();

  const { enqueueSnackbar } = useSnackbar();

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleShare = () => {
    if (article.url) {
      navigator.clipboard.writeText(article.url);
      alert("Url copied to clipboard: " + article.url);
    }
    closeMenu();
  };

  const handleArchive = () => {
    try {
      // updateArticleState(storage.client!, article.slug, "archived");
      updateArticleMetadata(storage.client!, { ...article, state: "archived" });
      enqueueSnackbar("Article archived");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to archive article", { variant: "error" });
    }
  };

  const handleUnarchive = () => {
    if (!article) throw new Error("Article is undefined");

    try {
      // updateArticleState(storage.client!, article.slug, "unread");
      updateArticleMetadata(storage.client!, { ...article, state: "unread" });
      enqueueSnackbar("Article unarchived");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to unarchive article", { variant: "error" });
    }
  };

  const handleDelete = async () => {
    try {
      await removeArticle(storage.client!, article.slug);
      enqueueSnackbar("Article deleted");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to delete article", { variant: "error" });
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  return (
    <ListItem
      sx={{
        // borderBottom: "1px solid",
        // borderColor: "divider",
        "&:hover": {
          backgroundColor: "action.hover",
        },
      }}
    >
      <ListItemAvatar
        onClick={() => navigate({ to: "/article/$slug", params: { slug: article.slug } })}
      >
        <img
          src="/static/article_bw.webp"
          alt="Article"
          style={{ width: 100, height: 100, objectFit: "cover" }}
        />
      </ListItemAvatar>
      <ListItemText
        sx={{
          marginLeft: 2,
        }}
        onClick={() => navigate({ to: "/article/$slug", params: { slug: article.slug } })}
        primary={article.title}
        secondary={
          <Typography variant="caption" color="text.secondary">
            {new Date(article.ingestDate).toLocaleDateString()}
          </Typography>
        }
      />
      <IconButton onClick={openMenu}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
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
        <MenuItem onClick={handleDelete}>
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

  const articles = useLiveQuery(() => db.articles.orderBy("ingestDate").reverse().toArray());

  const [filter, setFilter] = useState<"unread" | "archived">("unread");
  const [url, setUrl] = useState<string>("");
  const [ingestPercent, setIngestPercent] = useState<number>(0);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const corsProxy = getCorsProxyValue();

  const { remoteStorage, client, widget } = useRemoteStorage();

  useEffect(() => {
    // Set the storage client in the extension connector
    if (client) {
      // alert("set storage client");
      extensionConnector.setStorageClient(client);

      // Set the progress callback for the extension connector
      extensionConnector.setProgressCallback((percent, message) => {
        if (percent !== null) {
          setIngestStatus(message);
          setIngestPercent(percent);
          // Show the dialog when ingestion starts
          if (!dialogVisible) {
            setDialogVisible(true);
          }
        }
        // Optionally hide the dialog when ingestion is complete (percent is 100)
        if (percent === 100) {
          setTimeout(() => {
            setDialogVisible(false);
          }, 2000); // Hide after 2 seconds
        }
      });
    }
  }, [client, dialogVisible]); // Run this effect when the client or dialogVisible changes

  const filteredArticles = articles ? articles.filter((article) => article.state === filter) : [];

  const saveUrl = async () => {
    // TODO: pass in headers/cookies for downloading

    // This function is now primarily for the manual URL input in the dialog.
    // The bookmarklet ingestion will use the progress callback set in useEffect.
    setIngestStatus("Ingesting...");
    await ingestUrl2(client, corsProxy, url, (percent: number | null, message: string | null) => {
      if (percent !== null) {
        setIngestStatus(message);
        setIngestPercent(percent);
      }
      console.log(`INGESTED URL ${url}`);
    })
      .then((article) => {
        db.articles.put(article);
        // showMessage("Article saved");

        // wait a bit before closing the dialog
        setTimeout(() => {
          setDialogVisible(false);
          setIngestStatus(null);
          setIngestPercent(0);
          setUrl("");
        }, 2000);
      })
      .catch((error) => {
        console.error(error);
        // showMessage("Error saving article", true);
      });

    // setIngestPercent(0);
    // setIngestStatus("Starting ingestion...");

    // // Simulate progress
    // const interval = setInterval(() => {
    //   setIngestPercent((prev) => {
    //     if (prev >= 100) {
    //       clearInterval(interval);
    //       setTimeout(() => {
    //         setDialogVisible(false);
    //         setIngestPercent(0);
    //         setIngestStatus(null);
    //       }, 1000);
    //       return 100;
    //     }
    //     return prev + 10;
    //   });
    // }, 200);

    // setIngestStatus("Processing article...");
  };

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
        }}
      >
        <Tooltip title="Add article">
          <IconButton
            onClick={() => {
              setDialogVisible(true);
              if (shouldEnableSampleUrls()) {
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
              <ArticleIcon sx={{ mr: 1 }} />
              Saves
            </ToggleButton>
            <ToggleButton value="archived">
              <ArchiveIcon2 sx={{ mr: 1 }} />
              Archive
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
            <Typography variant="h4" gutterBottom>
              Welcome to Savr
            </Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {filter === "unread"
                ? "Start saving articles to see them here"
                : "No archived articles yet"}
            </Typography>

            {filter === "unread" ? (
              <Button
                variant="contained"
                onClick={() => {
                  setDialogVisible(true);
                  if (shouldEnableSampleUrls()) {
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
            label="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            margin="normal"
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
          <Button onClick={() => setDialogVisible(false)}>Cancel</Button>
          <Button
            onClick={saveUrl}
            variant="contained"
            disabled={ingestStatus !== null || !url.trim()}
          >
            Save
          </Button>
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
    </Box>
  );
}
