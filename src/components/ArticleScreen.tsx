import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import ReactMarkdown from "react-markdown";
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
  Drawer,
  TextField,
  Button,
  Stack,
  LinearProgress,
  CircularProgress,
  Collapse,
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
  Headphones as HeadphonesIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  AutoAwesome as AutoAwesomeIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from "@mui/icons-material";
import { Route } from "~/routes/article.$slug";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { db } from "~/utils/db";
import { Article } from "../../lib/src/models";
import { removeArticle, patchArticleMetadata } from "~/utils/tools";
import { useSnackbar } from "notistack";
import ArticleComponent from "./ArticleComponent";
import { CookieThemeToggle } from "./CookieThemeToggle";
import TextToSpeechDrawer from "./TextToSpeechDrawer";
import { useTextToSpeech } from "~/hooks/useTextToSpeech";
import { getFontSizeFromCookie, setFontSizeInCookie } from "~/utils/cookies";
import { getHeaderHidingFromCookie } from "~/utils/cookies";
import { getFilePathContent, getFilePathRaw, getFileFetchLog, getFilePathPdf, getFilePathImage, mimeToExt } from "../../lib/src/lib";
import { calculateArticleStorageSize, formatBytes } from "~/utils/storage";
import { ingestUrl } from "../../lib/src/ingestion";
import {
  summarizeText,
  DEFAULT_SUMMARY_SETTINGS,
  type SummarizationProgress,
  type SummaryProvider,
} from "~/utils/summarization";
import {
  getSummarizationEnabledFromCookie,
  getSummaryProviderFromCookie,
  getSummaryModelFromCookie,
  getApiKeyForProvider,
  getSummarySettingsFromCookie,
} from "~/utils/cookies";

interface Props {
  /**
   * Injected by the documentation to work in an iframe.
   * You won't need it on your project.
   */

  window?: () => Window;
  children?: React.ReactElement<unknown>;
}

export default function ArticleScreen(_props: Props) {
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
  const [fetchLog, setFetchLog] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const [headerHidingEnabled, setHeaderHidingEnabled] = useState(true);
  const [ttsDrawerOpen, setTtsDrawerOpen] = useState(false);
  const [refetchDrawerOpen, setRefetchDrawerOpen] = useState(false);
  const [refetchPercent, setRefetchPercent] = useState<number>(0);
  const [refetchStatus, setRefetchStatus] = useState<string | null>(null);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
  const [_summaryProgress, setSummaryProgress] = useState<SummarizationProgress | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [html, setHtml] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [storageSize, setStorageSize] = useState<{
    totalSize: number;
    files: { path: string; size: number }[];
  } | null>(null);

  // Article metadata is read reactively from Dexie, so any write — local
  // (progress, summary, archive) or from background sync — is reflected here
  // without manual setState bookkeeping. undefined until the row loads.
  const liveArticle = useLiveQuery(() => db.articles.get(slug), [slug]);
  // Fallback keeps property access in the JSX safe while loading.
  const article = liveArticle ?? ({} as Article);
  const articleLoaded = liveArticle !== undefined;
  const mimeType = liveArticle?.mimeType;

  // Latest article snapshot for async callbacks (the debounced scroll-progress
  // writer, long-running summarization) so they write against current data
  // instead of a stale render closure.
  const articleRef = useRef<Article | null>(null);
  articleRef.current = liveArticle ?? null;

  // Extract plain text from HTML content for TTS
  const articleText = useMemo(() => {
    if (!content) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    // Remove script and style elements
    doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    // Get text content
    return doc.body?.textContent?.trim() || "";
  }, [content]);

  // Initialize TTS hook
  const [ttsState, ttsControls] = useTextToSpeech(articleText);

  // Store stop function in ref to avoid dependency issues
  const ttsStopRef = useRef(ttsControls.stop);
  ttsStopRef.current = ttsControls.stop;

  // Stop TTS when navigating away (only on unmount)
  useEffect(() => {
    return () => {
      ttsStopRef.current();
    };
  }, []);

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

  const handleToggleFavorite = async () => {
    closeMenu();
    if (!storage.client) {
      enqueueSnackbar("Storage not ready yet", { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, {
        favorite: !article.favorite,
      });
      enqueueSnackbar(article.favorite ? "Removed from favorites" : "Added to favorites");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to update favorite", { variant: "error" });
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
      await removeArticle(article.slug);
      navigate({ to: "/" });
      enqueueSnackbar("Article deleted");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to delete article", { variant: "error" });
    }
  };

  const handleSummarize = async () => {
    closeMenu();
    setSummaryDrawerOpen(true);

    // If we already have a summary, just show it
    if (article.summary) {
      return;
    }

    if (!articleText) {
      enqueueSnackbar("No article content to summarize", { variant: "error" });
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
    setSummaryProgress({ status: "summarizing" });

    try {
      // Get settings from preferences
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
        articleText,
        settings,
        provider,
        apiKey,
        model,
        (progress) => {
          setSummaryProgress(progress);
        },
      );

      // Save summary to article metadata; liveQuery refreshes the UI.
      // Patch only the summary field — summarization can take long enough
      // for sync to have updated the article in the meantime.
      await patchArticleMetadata(storage.client!, article.slug, { summary });

      enqueueSnackbar("Summary generated");
    } catch (error) {
      console.error("Summarization failed:", error);
      enqueueSnackbar("Failed to generate summary", { variant: "error" });
    } finally {
      setIsSummarizing(false);
      setSummaryProgress(null);
    }
  };

  const handleArchive = async () => {
    if (!storage.client) {
      enqueueSnackbar("Storage not ready yet", { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, { state: "archived" });

      enqueueSnackbar("Article archived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to archive article", { variant: "error" });
    }
  };

  const handleUnarchive = async () => {
    if (!storage.client) {
      enqueueSnackbar("Storage not ready yet", { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, { state: "unread" });

      enqueueSnackbar("Article unarchived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to unarchive article", { variant: "error" });
    }
  };

  const handleEditInfo = async () => {
    setEditTitle(article.title || "");
    setEditAuthor(article.author || "");
    setFetchLog(null);
    setInfoDrawerOpen(true);
    closeMenu();

    // Load fetch log asynchronously
    try {
      const logFile = (await storage.client?.getFile(getFileFetchLog(slug), false)) as {
        data: string;
      } | undefined;
      if (logFile?.data) {
        setFetchLog(logFile.data);
      }
    } catch (e) {
      console.error("Failed to load fetch log:", e);
    }
  };

  const handleRefetch = async () => {
    if (!article.url) {
      enqueueSnackbar("No URL available to refetch", { variant: "error" });
      closeMenu();
      return;
    }

    closeMenu();
    setRefetchDrawerOpen(true);
    setRefetchStatus("Starting refetch...");
    setRefetchPercent(0);

    try {
      const updatedArticle = await ingestUrl(
        storage.client,
        article.url,
        (percent: number | null, message: string | null) => {
          if (percent !== null) {
            setRefetchStatus(message);
            setRefetchPercent(percent);
          }
        },
      );

      // Preserve some metadata from the original article
      updatedArticle.progress = article.progress;
      updatedArticle.state = article.state;

      // Save to IndexedDB; liveQuery refreshes the displayed metadata
      await db.articles.put(updatedArticle);

      // Reload the displayed content
      const file = (await storage.client?.getFile(getFilePathContent(slug), false)) as {
        data: string;
      };
      if (file) {
        setContent(file.data);
        if (viewMode === "cleaned") {
          setHtml(`<link rel="stylesheet" href="/static/web.css">${file.data}`);
        } else {
          setHtml(file.data);
        }
      }

      // Use persisted size info from re-ingested article, fallback to on-demand calculation
      if (updatedArticle.sizeBytes == null || updatedArticle.assetCount == null) {
        calculateArticleStorageSize(slug)
          .then((sizeInfo) => {
            setStorageSize(sizeInfo);
          })
          .catch((error) => {
            console.error("Failed to calculate storage size:", error);
          });
      }

      setTimeout(() => {
        setRefetchDrawerOpen(false);
        setRefetchPercent(0);
        setRefetchStatus(null);
        enqueueSnackbar("Article refetched successfully");
      }, 1000);
    } catch (error) {
      console.error("Refetch error:", error);
      setRefetchStatus("Failed to refetch article");
      setTimeout(() => {
        setRefetchDrawerOpen(false);
        setRefetchPercent(0);
        setRefetchStatus(null);
        enqueueSnackbar("Failed to refetch article", { variant: "error" });
      }, 2000);
    }
  };

  const handleSaveEdit = async () => {
    if (!storage.client) {
      enqueueSnackbar("Storage not ready yet", { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, slug, {
        title: editTitle,
        author: editAuthor,
      });

      // Load the current HTML from storage (local-only for fast read)
      const file = (await storage.client.getFile(getFilePathContent(slug), false)) as {
        data: string;
      };
      if (!file) {
        throw new Error("Could not load HTML from storage");
      }

      // Update the HTML content with new title/author
      const parser = new DOMParser();
      const doc = parser.parseFromString(file.data, "text/html");

      // Update title in the h1 element
      const titleEl = doc.querySelector("#savr-metadata h1");
      if (titleEl) {
        titleEl.textContent = editTitle;
      }

      // Update author in the byline element
      const bylineEl = doc.querySelector("#savr-byline");
      if (bylineEl) {
        bylineEl.textContent = editAuthor;
      }

      // Also update the page title
      const pageTitleEl = doc.querySelector("title");
      if (pageTitleEl) {
        pageTitleEl.textContent = `Savr - ${editTitle}`;
      }

      // Save the updated HTML back to storage, preserving the original shape:
      // stored content is an ArticleTemplate fragment, so don't wrap it in the
      // full <html> document that DOMParser created (which also drops doctypes).
      const isFragment = !/<html[\s>]/i.test(file.data);
      const updatedHtml = isFragment
        ? // head holds elements like <title> that DOMParser hoisted out of the fragment
          doc.head.innerHTML + doc.body.innerHTML
        : (file.data.trimStart().toLowerCase().startsWith("<!doctype") ? "<!DOCTYPE html>" : "") +
          doc.documentElement.outerHTML;
      await storage.client?.storeFile("text/html", getFilePathContent(slug), updatedHtml);

      // Update displayed content immediately
      setContent(updatedHtml);
      if (viewMode === "cleaned") {
        setHtml(`<link rel="stylesheet" href="/static/web.css">${updatedHtml}`);
      } else {
        setHtml(updatedHtml);
      }

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
  const lastSavedPercentage = useRef<number | null>(null);
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

        // Only save if the percentage has changed
        if (scrollPercentage !== lastSavedPercentage.current) {
          lastSavedPercentage.current = scrollPercentage;

          // Patch only the progress field so a save fired after a sync update
          // can't write back stale metadata. Skip the public-export republish:
          // scroll progress alone shouldn't re-publish the whole database.
          if (storage.client && articleRef.current) {
            await patchArticleMetadata(
              storage.client,
              articleRef.current.slug,
              { progress: scrollPercentage },
              { skipPublicExport: true }
            );
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
  }, [storage.client, headerHidingEnabled]);

  // Load the article content (HTML, PDF, or image) once the metadata row is
  // available. Deps are the narrow values the load actually reads — never the
  // article object itself — so metadata-only updates (progress saves, sync
  // from other devices) cannot re-trigger a content reload mid-read.
  useEffect(() => {
    const client = storage.client;
    if (!articleLoaded || !client) return;

    let cancelled = false;
    // Track the blob URL created by THIS effect run so cleanup revokes the
    // real value (revoking via the pdfUrl/imageUrl state captured a stale
    // closure and leaked every URL).
    let objectUrl: string | null = null;

    const load = async () => {
      try {
        if (mimeType === "application/pdf") {
          const file = (await client.getFile(getFilePathPdf(slug), false)) as {
            data: ArrayBuffer;
            contentType: string;
          } | null;
          if (file && !cancelled) {
            const blob = new Blob([file.data], { type: "application/pdf" });
            objectUrl = URL.createObjectURL(blob);
            setPdfUrl(objectUrl);
          }
        } else if (mimeType?.startsWith("image/")) {
          const extension = mimeToExt[mimeType] || "jpg";
          const file = (await client.getFile(getFilePathImage(slug, extension), false)) as {
            data: ArrayBuffer;
            contentType: string;
          } | null;
          if (file && !cancelled) {
            const blob = new Blob([file.data], { type: mimeType });
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          }
        } else if (viewMode === "original") {
          // maxAge: false = local-only, no network requests
          const file = (await client.getFile(getFilePathRaw(slug), false)) as {
            data: string;
          } | null;
          if (file && !cancelled) {
            setContent(file.data);
            setHtml(file.data);
          }
        } else {
          const file = (await client.getFile(getFilePathContent(slug), false)) as {
            data: string;
          } | null;
          if (file && !cancelled) {
            setContent(file.data);
            setHtml(`<link rel="stylesheet" href="/static/web.css">${file.data}`);
          }
        }
      } catch (error) {
        console.error("Error retrieving article", error);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [articleLoaded, mimeType, viewMode, slug, storage.client]);

  // Calculate storage size on demand for articles ingested before size info
  // was persisted. Independent of content loading and view mode.
  const sizeKnown = liveArticle?.sizeBytes != null && liveArticle?.assetCount != null;
  useEffect(() => {
    if (!articleLoaded || sizeKnown) return;
    calculateArticleStorageSize(slug)
      .then(setStorageSize)
      .catch((error) => {
        console.error("Failed to calculate storage size:", error);
      });
  }, [articleLoaded, sizeKnown, slug]);

  // Restore the reading position exactly once, when content first becomes
  // available. Marked done immediately (even when there is nothing to restore)
  // so later progress writes — which re-emit the article via liveQuery —
  // can never scroll the page out from under the reader.
  useEffect(() => {
    if (hasSetInitialScroll || !content || !liveArticle) return;
    setHasSetInitialScroll(true);

    const progress = liveArticle.progress ?? 0;
    if (progress > 0) {
      // Wait a bit for the DOM to fully render
      setTimeout(() => {
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (documentHeight > 0) {
          const scrollPosition = (progress / 100) * documentHeight;
          console.log("setting scroll position to", scrollPosition);
          window.scrollTo(0, scrollPosition);
        }
      }, 100);
    }
  }, [hasSetInitialScroll, liveArticle, content]);

  // Handle click on summary link (injected into HTML content)
  useEffect(() => {
    const handleSummaryLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.id === "savr-summary-link-anchor" || target.closest("#savr-summary-link-anchor")) {
        e.preventDefault();
        setSummaryDrawerOpen(true);
      }
    };

    document.addEventListener("click", handleSummaryLinkClick);
    return () => document.removeEventListener("click", handleSummaryLinkClick);
  }, []);

  // Compute HTML with summary link injected if summary exists
  const htmlWithSummaryLink = useMemo(() => {
    if (!html || !article.summary) return html;

    // Inject summary link after the reading time div
    const summaryLinkHtml = ` · <a id="savr-summary-link-anchor" href="#" style="color: inherit; text-decoration: underline; cursor: pointer;">View Summary</a>`;

    // Find the savr-readTime div and append the link inside it
    return html.replace(
      /(<div id="savr-readTime"[^>]*>)(.*?)(<\/div>)/,
      `$1$2${summaryLinkHtml}$3`
    );
  }, [html, article.summary]);

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

          <Tooltip title="Listen to article">
            <IconButton
              color="inherit"
              onClick={() => setTtsDrawerOpen(true)}
              data-testid="tts-button"
            >
              <HeadphonesIcon />
            </IconButton>
          </Tooltip>

          {article.state === "archived" ? (
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

          <IconButton color="inherit" onClick={openMenu} data-testid="article-page-menu-button">
            <MoreVertIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={closeMenu}
            data-testid="article-page-menu"
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

            <MenuItem onClick={handleEditInfo} sx={{ py: 1 }}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Edit Info</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={handleRefetch}
              sx={{ py: 1 }}
              disabled={!article.url}
              data-testid="article-page-menu-refetch"
            >
              <ListItemIcon>
                <RefreshIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Refetch</ListItemText>
            </MenuItem>
            {/* Only show Summarize option if summarization is enabled */}
            {getSummarizationEnabledFromCookie() && (
              <MenuItem onClick={handleSummarize} sx={{ py: 1 }}>
                <ListItemIcon>
                  <AutoAwesomeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{article.summary ? "View Summary" : "Summarize"}</ListItemText>
              </MenuItem>
            )}

            <MenuItem onClick={handleToggleFavorite} sx={{ py: 1 }} data-testid="article-page-menu-favorite">
              <ListItemIcon>
                {article.favorite ? (
                  <StarIcon fontSize="small" />
                ) : (
                  <StarBorderIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>{article.favorite ? "Unmark favorite" : "Mark favorite"}</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleShare} sx={{ py: 1 }}>
              <ListItemIcon>
                <ShareIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Share</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleDelete} sx={{ py: 1 }} data-testid="article-page-menu-delete">
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ mt: headerHidingEnabled ? 0 : "64px" }}>
        {article.mimeType === "application/pdf" && pdfUrl ? (
          <Box
            sx={{
              width: "100%",
              height: "calc(100vh - 64px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <iframe
              src={pdfUrl}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
              title={article.title || "PDF Document"}
            />
          </Box>
        ) : article.mimeType?.startsWith("image/") && imageUrl ? (
          <Box
            sx={{
              width: "100%",
              minHeight: "calc(100vh - 64px)",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              p: 2,
              bgcolor: "background.default",
            }}
          >
            <img
              src={imageUrl}
              alt={article.title || "Image"}
              style={{
                maxWidth: "100%",
                maxHeight: "calc(100vh - 96px)",
                objectFit: "contain",
              }}
            />
          </Box>
        ) : (
          <ArticleComponent html={htmlWithSummaryLink} fontSize={fontSize} />
        )}
      </Box>

      {/* Info Bottom Drawer */}
      <Drawer
        anchor="bottom"
        open={infoDrawerOpen}
        onClose={() => {
          setInfoDrawerOpen(false);
          setLogExpanded(false);
        }}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "70vh",
          },
        }}
      >
        <Box sx={{ p: 3, overflowY: "auto" }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Article Info
          </Typography>

          {/* Editable fields */}
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

            {/* Read-only metadata section */}
            <Box>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Size:</strong>{" "}
                  {article.sizeBytes != null
                    ? formatBytes(article.sizeBytes)
                    : storageSize
                      ? formatBytes(storageSize.totalSize)
                      : "Calculating..."}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Offline resources:</strong>{" "}
                  {article.assetCount != null
                    ? `${article.assetCount} files`
                    : storageSize
                      ? `${storageSize.files.filter((f) => f.path.includes("/resources/")).length} files`
                      : "Calculating..."}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Saved:</strong>{" "}
                  {article.ingestDate
                    ? `${new Date(article.ingestDate).toISOString().replace("T", " ").replace("Z", "")} UTC`
                    : "Unknown"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Content Type:</strong> {article.mimeType || "Unknown"}
                </Typography>
              </Stack>
            </Box>

            {/* Ingestion Log (collapsible) */}
            {fetchLog && (
              <Box>
                <Button
                  onClick={() => setLogExpanded(!logExpanded)}
                  startIcon={logExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ mb: 1, textTransform: "none" }}
                  size="small"
                >
                  Ingestion Log
                </Button>
                <Collapse in={logExpanded}>
                  <Box
                    data-testid="ingestion-log-content"
                    sx={{
                      p: 2,
                      backgroundColor: "action.hover",
                      borderRadius: 1,
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: "150px",
                      overflowY: "auto",
                    }}
                  >
                    {fetchLog}
                  </Box>
                </Collapse>
              </Box>
            )}

            <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setInfoDrawerOpen(false);
                  setLogExpanded(false);
                }}
              >
                Cancel
              </Button>
              <Button variant="contained" onClick={handleSaveEdit}>
                Save
              </Button>
            </Box>
          </Stack>
        </Box>
      </Drawer>

      {/* Refetch Progress Drawer */}
      <Drawer
        anchor="bottom"
        open={refetchDrawerOpen}
        onClose={() => {}}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "30vh",
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Refetching Article
          </Typography>
          {refetchStatus && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {refetchStatus}
            </Typography>
          )}
          <LinearProgress variant="determinate" value={refetchPercent} />
        </Box>
      </Drawer>

      {/* Text to Speech Drawer */}
      <TextToSpeechDrawer
        open={ttsDrawerOpen}
        onClose={() => setTtsDrawerOpen(false)}
        ttsState={ttsState}
        ttsControls={ttsControls}
      />

      {/* Summary Drawer */}
      <Drawer
        anchor="bottom"
        open={summaryDrawerOpen}
        onClose={() => setSummaryDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "60vh",
            bgcolor: "background.paper",
            color: "text.primary",
          },
        }}
      >
        <Box sx={{ p: 3, bgcolor: "background.paper", color: "text.primary" }}>
          <Typography
            variant="h6"
            sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1, color: "text.primary" }}
          >
            <AutoAwesomeIcon color="primary" />
            Summary
          </Typography>

          {isSummarizing && (
            <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Generating summary...
              </Typography>
            </Box>
          )}

          {!isSummarizing && article.summary && (
            <Box
              sx={{
                lineHeight: 1.7,
                color: "text.primary",
                "& p": { margin: "0.5em 0", color: "text.primary" },
                "& ul, & ol": { pl: 2, my: 1, color: "text.primary" },
                "& li": { mb: 0.5, color: "text.primary" },
                "& strong": { fontWeight: 600, color: "text.primary" },
                "& h1, & h2, & h3, & h4": {
                  mt: 1.5,
                  mb: 0.5,
                  fontWeight: 600,
                  color: "text.primary",
                },
                "& a": { color: "primary.main" },
                "& code": {
                  bgcolor: "action.hover",
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontSize: "0.9em",
                },
                "& blockquote": {
                  borderLeft: 3,
                  borderColor: "divider",
                  pl: 2,
                  ml: 0,
                  color: "text.secondary",
                  fontStyle: "italic",
                },
              }}
            >
              <ReactMarkdown>{article.summary}</ReactMarkdown>
            </Box>
          )}

          {!isSummarizing && !article.summary && (
            <Typography variant="body2" color="text.secondary">
              No summary available. Click "Generate" to create one.
            </Typography>
          )}

          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              {article.summary && !isSummarizing && (
                <>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={async () => {
                      await patchArticleMetadata(storage.client!, article.slug, {
                        summary: undefined,
                      });
                      enqueueSnackbar("Summary cleared");
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={async () => {
                      // The old summary stays in the db until the new one is
                      // saved; the drawer hides it while isSummarizing is set.
                      if (!articleText) {
                        enqueueSnackbar("No article content to summarize", { variant: "error" });
                        return;
                      }

                      const provider = getSummaryProviderFromCookie() as SummaryProvider;
                      const model = getSummaryModelFromCookie();
                      const apiKey = getApiKeyForProvider(provider);

                      if (!apiKey) {
                        enqueueSnackbar("Please set up your API key in Preferences", {
                          variant: "warning",
                        });
                        return;
                      }

                      setIsSummarizing(true);
                      setSummaryProgress({ status: "summarizing" });

                      try {
                        const cookieSettings = getSummarySettingsFromCookie();
                        const settings = {
                          ...DEFAULT_SUMMARY_SETTINGS,
                          detailLevel:
                            cookieSettings.detailLevel as typeof DEFAULT_SUMMARY_SETTINGS.detailLevel,
                          tone: cookieSettings.tone as typeof DEFAULT_SUMMARY_SETTINGS.tone,
                          focus: cookieSettings.focus as typeof DEFAULT_SUMMARY_SETTINGS.focus,
                          format: cookieSettings.format as typeof DEFAULT_SUMMARY_SETTINGS.format,
                          customPrompt: cookieSettings.customPrompt,
                        };

                        const summary = await summarizeText(
                          articleText,
                          settings,
                          provider,
                          apiKey,
                          model,
                          (progress) => setSummaryProgress(progress),
                        );

                        await patchArticleMetadata(storage.client!, article.slug, { summary });
                        enqueueSnackbar("Summary regenerated");
                      } catch (error) {
                        console.error("Summarization failed:", error);
                        enqueueSnackbar("Failed to generate summary", { variant: "error" });
                      } finally {
                        setIsSummarizing(false);
                        setSummaryProgress(null);
                      }
                    }}
                  >
                    Regenerate
                  </Button>
                </>
              )}
              {!article.summary && !isSummarizing && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={async () => {
                    if (!articleText) {
                      enqueueSnackbar("No article content to summarize", { variant: "error" });
                      return;
                    }

                    const provider = getSummaryProviderFromCookie() as SummaryProvider;
                    const model = getSummaryModelFromCookie();
                    const apiKey = getApiKeyForProvider(provider);

                    if (!apiKey) {
                      enqueueSnackbar("Please set up your API key in Preferences", {
                        variant: "warning",
                      });
                      return;
                    }

                    setIsSummarizing(true);
                    setSummaryProgress({ status: "summarizing" });

                    try {
                      const cookieSettings = getSummarySettingsFromCookie();
                      const settings = {
                        ...DEFAULT_SUMMARY_SETTINGS,
                        detailLevel:
                          cookieSettings.detailLevel as typeof DEFAULT_SUMMARY_SETTINGS.detailLevel,
                        tone: cookieSettings.tone as typeof DEFAULT_SUMMARY_SETTINGS.tone,
                        focus: cookieSettings.focus as typeof DEFAULT_SUMMARY_SETTINGS.focus,
                        format: cookieSettings.format as typeof DEFAULT_SUMMARY_SETTINGS.format,
                        customPrompt: cookieSettings.customPrompt,
                      };

                      const summary = await summarizeText(
                        articleText,
                        settings,
                        provider,
                        apiKey,
                        model,
                        (progress) => setSummaryProgress(progress),
                      );

                      await patchArticleMetadata(storage.client!, article.slug, { summary });
                      enqueueSnackbar("Summary generated");
                    } catch (error) {
                      console.error("Summarization failed:", error);
                      enqueueSnackbar("Failed to generate summary", { variant: "error" });
                    } finally {
                      setIsSummarizing(false);
                      setSummaryProgress(null);
                    }
                  }}
                >
                  Generate Summary
                </Button>
              )}
            </Box>
            <Button variant="outlined" onClick={() => setSummaryDrawerOpen(false)}>
              Close
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
