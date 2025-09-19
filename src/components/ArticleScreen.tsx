import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Paper,
  Container,
  Slide,
  useScrollTrigger,
  Drawer,
  TextField,
  Button,
  Stack,
} from "@mui/material";
// import useScrollTrigger from "@mui/material/useScrollTrigger";
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  MoreVert as MoreVertIcon,
  Code as CodeIcon,
  TextFields as TextFieldsIcon,
  OpenInNew as OpenInNewIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { Route } from "~/routes/article.$slug";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { db } from "~/utils/db";
import { Article } from "../../lib/src/models";
import { removeArticle, updateArticleMetadata } from "~/utils/tools";
import { useSnackbar } from "notistack";
import ArticleComponent from "./ArticleComponent";
import { CookieThemeToggle } from "./CookieThemeToggle";
import { getFontSizeFromCookie, setFontSizeInCookie } from "~/utils/cookies";
import { getHeaderHidingFromCookie } from "~/utils/cookies";
import { getFilePathContent, getFilePathMetadata, getFilePathRaw } from "../../lib/src/lib";
import { calculateArticleStorageSize, formatBytes } from "~/utils/storage";
import { isDebugMode } from "~/config/environment";

interface Props {
  /**
   * Injected by the documentation to work in an iframe.
   * You won't need it on your project.
   */

  window?: () => Window;
  children?: React.ReactElement<unknown>;
}

export default function ArticleScreen(props: Props) {
  // Get slug from URL path parameter
  // const slug = window.location.pathname.split("/").pop();
  const { slug } = Route.useParams();

  const storage = useRemoteStorage();

  const { enqueueSnackbar } = useSnackbar();

  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(getFontSizeFromCookie());
  const [viewMode, setViewMode] = useState<"cleaned" | "original">("cleaned");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [headerHidingEnabled, setHeaderHidingEnabled] = useState(true);

  const [html, setHtml] = useState("");

  const [content, setContent] = useState("");
  const [storageSize, setStorageSize] = useState<{
    totalSize: number;
    files: { path: string; size: number }[];
  } | null>(null);

  const [article, setArticle] = useState({} as Article);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleVisitOriginal = () => {
    if (article.url) {
      window.open(article.url, "_blank");
    }
    closeMenu();
  };

  const displayDebugMessage = (message: string) => {
    if (isDebugMode()) {
      setHtml(message);
    }
  };

  const handleShare = () => {
    if (article.url) {
      navigator.clipboard.writeText(article.url);
      alert("Url copied to clipboard: " + article.url);
    }
    closeMenu();
  };

  const handleDelete = async () => {
    try {
      await removeArticle(storage.client!, article.slug);
      navigate({ to: "/" });
      enqueueSnackbar("Article deleted");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to delete article", { variant: "error" });
    }
  };

  const handleArchive = () => {
    try {
      // updateArticleState(storage.client!, article.slug, "archived");
      updateArticleMetadata(storage.client!, { ...article, state: "archived" });

      enqueueSnackbar("Article archived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to archive article", { variant: "error" });
    }
  };

  const handleUnarchive = () => {
    if (!article) throw new Error("Article is undefined");

    try {
      updateArticleMetadata(storage.client!, { ...article, state: "unread" });

      enqueueSnackbar("Article unarchived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to unarchive article", { variant: "error" });
    }
  };

  const handleEditInfo = () => {
    setEditTitle(article.title || "");
    setEditAuthor(article.author || "");
    setInfoDrawerOpen(true);
    closeMenu();
  };

  const handleSaveEdit = async () => {
    try {
      const updatedArticle = await updateArticleMetadata(storage.client!, {
        ...article,
        title: editTitle,
        author: editAuthor,
      });

      console.log("updatedArticle", updatedArticle);

      // await db.articles.put(updatedArticle);
      setArticle(updatedArticle);

      // const raw = await storage.client?.getFile(getFilePathRaw(slug));

      // Load the current HTML from storage
      const file = (await storage.client?.getFile(getFilePathContent(slug))) as { data: string };
      if (!file) {
        throw new Error("Could not load HTML from storage");
      }

      // Update the HTML content with new title/author
      const parser = new DOMParser();
      const doc = parser.parseFromString(file.data, "text/html");

      // Update metadata in the document
      const metaDiv = doc.querySelector("#savr-metadata");
      if (metaDiv) {
        metaDiv.textContent = JSON.stringify(
          {
            title: editTitle,
            author: editAuthor,
            // Preserve other metadata
            ...JSON.parse(metaDiv.textContent || "{}"),
          },
          null,
          2
        );

        console.log("metaDiv", metaDiv);
      }

      // Save the updated HTML back to storage
      const updatedHtml = doc.documentElement.outerHTML;
      await storage.client?.storeFile("text/html", getFilePathContent(slug), updatedHtml);

      setInfoDrawerOpen(false);
      enqueueSnackbar("Article info updated");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to update article info", { variant: "error" });
    }
  };

  // Sticky hide-on-scroll header logic
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);

  // Scroll percentage tracking
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoggedPercentage = useRef<number | null>(null);
  // const hasSetInitialScroll = useRef(false);
  const [hasSetInitialScroll, setHasSetInitialScroll] = useState(false);

  useEffect(() => {
    // Load header hiding preference
    setHeaderHidingEnabled(getHeaderHidingFromCookie());
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // Only apply header hiding logic if the preference is enabled
      if (!headerHidingEnabled) {
        setShowHeader(true);
        return;
      }

      const currentScrollY = window.scrollY;
      if (currentScrollY < 0) return;
      if (currentScrollY < 50) {
        setShowHeader(true);
        lastScrollY.current = currentScrollY;
        return;
      }
      if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setShowHeader(false);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setShowHeader(true);
      }
      lastScrollY.current = currentScrollY;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set new timeout to log scroll percentage after 1 second of inactivity
      scrollTimeoutRef.current = setTimeout(async () => {
        const scrollTop = window.scrollY;
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercentage = Math.round((scrollTop / documentHeight) * 100);

        // Only log if the percentage has changed
        if (scrollPercentage !== lastLoggedPercentage.current) {
          console.log(`Article scroll percentage: ${scrollPercentage}%`);
          lastLoggedPercentage.current = scrollPercentage;

          if (storage.client) {
            article.progress = scrollPercentage;

            // console.log("updatingArticle with", article);

            const updatedArticle = await updateArticleMetadata(storage.client, article);

            console.log("updatedArticle", updatedArticle);
          }
        }
      }, 1000);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [storage, article, headerHidingEnabled]);

  useEffect(() => {
    const setup = async () => {
      displayDebugMessage("querying database ...");

      db.articles.get(slug).then((article) => {
        if (!article) {
          console.error("Article not found");
          return;
        }
        setArticle(article);
      });

      try {
        displayDebugMessage("loading content ...");
        if (viewMode === "original") {
          storage.client
            ?.getFile(getFilePathRaw(slug))
            .then((file: any) => {
              setContent(file.data);
              setHtml(`${file.data}`);
            })
            .catch((error) => {
              console.error("Error retrieving article", error);
            });
        } else {
          storage.client
            ?.getFile(`saves/${slug}/index.html`)
            .then((file: any) => {
              setContent(file.data);
              setHtml(`<link rel="stylesheet" href="/static/web.css">${file.data}`);
            })
            .catch((error) => {
              console.error("Error retrieving article", error);
            });
        }

        // Calculate storage size for this article
        try {
          displayDebugMessage("calculating size...");
          const sizeInfo = await calculateArticleStorageSize(slug);
          setStorageSize(sizeInfo);
        } catch (error) {
          console.error("Failed to calculate storage size:", error);
        }
      } catch (e) {
        console.error(e);
      }
    };

    setup();
  }, [viewMode, slug, storage]);

  useEffect(() => {
    if (!hasSetInitialScroll && article.progress && article.progress > 0 && content) {
      // Wait a bit for the DOM to fully render
      setTimeout(() => {
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;

        if (documentHeight > 0) {
          const scrollPosition = (article.progress / 100) * documentHeight;
          console.log("setting scroll position to", scrollPosition);
          window.scrollTo(0, scrollPosition);
          setHasSetInitialScroll(true);
        }
      }, 100);
    }
  }, [hasSetInitialScroll, article.progress, content]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        position: "relative",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <AppBar
        position={headerHidingEnabled ? "sticky" : "fixed"}
        sx={{
          top: 0,
          zIndex: 1200,
          transition: headerHidingEnabled ? "transform 0.3s cubic-bezier(0.4,0,0.2,1)" : "none",
          transform: headerHidingEnabled
            ? showHeader
              ? "translateY(0)"
              : "translateY(-110%)"
            : "translateY(0)",
          width: "100%",
          maxWidth: "100vw",
          overflow: "hidden",
        }}
      >
        <Toolbar sx={{ minWidth: 0, overflow: "hidden" }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => navigate({ to: "/" })}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>

          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {/* {article.title} */}
          </Typography>

          <Tooltip title="Increase font size">
            <IconButton
              color="inherit"
              onClick={() => {
                const newSize = fontSize + 2;
                setFontSize(newSize);
                setFontSizeInCookie(newSize);
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Decrease font size">
            <IconButton
              color="inherit"
              onClick={() => {
                const newSize = fontSize - 2;
                setFontSize(newSize);
                setFontSizeInCookie(newSize);
              }}
            >
              <RemoveIcon />
            </IconButton>
          </Tooltip>

          <CookieThemeToggle size="small" />

          {article.state === ("archived" as any) ? (
            <Tooltip title="Unarchive">
              <IconButton color="inherit" onClick={handleUnarchive}>
                <UnarchiveIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Archive">
              <IconButton color="inherit" onClick={handleArchive}>
                <ArchiveIcon />
              </IconButton>
            </Tooltip>
          )}

          <IconButton color="inherit" onClick={openMenu}>
            <MoreVertIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={closeMenu}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            slotProps={{
              paper: {
                sx: {
                  zIndex: 1300,
                  mt: 1,
                  minWidth: 180,
                  maxWidth: 220,
                  py: 1,
                  boxShadow: 3,
                  borderRadius: 1,
                },
              },
            }}
            sx={{
              zIndex: 1300,
            }}
            disableScrollLock={true}
            disablePortal={false}
          >
            {viewMode === "cleaned" && (
              <MenuItem
                onClick={() => {
                  setViewMode("original");
                  closeMenu();
                }}
                sx={{ py: 1 }}
              >
                <ListItemIcon>
                  <CodeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Show Original</ListItemText>
              </MenuItem>
            )}

            {viewMode === "original" && (
              <MenuItem
                onClick={() => {
                  setViewMode("cleaned");
                  closeMenu();
                }}
                sx={{ py: 1 }}
              >
                <ListItemIcon>
                  <TextFieldsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Show Cleaned</ListItemText>
              </MenuItem>
            )}

            <MenuItem onClick={handleVisitOriginal} sx={{ py: 1 }}>
              <ListItemIcon>
                <OpenInNewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Visit Original</ListItemText>
            </MenuItem>

            {/* <MenuItem onClick={handleEditInfo}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Info</ListItemText>
            </MenuItem> */}

            <MenuItem onClick={handleShare} sx={{ py: 1 }}>
              <ListItemIcon>
                <ShareIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Share</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleDelete} sx={{ py: 1 }}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ mt: headerHidingEnabled ? 0 : "64px" }}>
        <ArticleComponent html={html} fontSize={fontSize} />
      </Box>

      {/* Info Bottom Drawer */}
      <Drawer
        anchor="bottom"
        open={infoDrawerOpen}
        onClose={() => setInfoDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "50vh",
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3 }}>
            Article Info
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Size: {storageSize ? formatBytes(storageSize.totalSize) : "Calculating..."}
          </Typography>

          <Stack spacing={3}>
            <TextField
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              fullWidth
              variant="outlined"
            />

            <TextField
              label="Author"
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              fullWidth
              variant="outlined"
            />

            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button variant="outlined" onClick={() => setInfoDrawerOpen(false)}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSaveEdit}>
                Save
              </Button>
            </Box>
          </Stack>
        </Box>
      </Drawer>
    </Box>
  );
}
