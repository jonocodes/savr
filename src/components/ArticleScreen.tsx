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
  Select,
  MenuItem as SelectMenuItem,
  FormControl,
  InputLabel,
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
  FormatSize as FormatSizeIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
} from "@mui/icons-material";
import { Route } from "~/routes/article.$slug";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { db } from "~/utils/db";
import { Article, SummaryMeta } from "../../lib/src/models";
import {
  removeArticle,
  patchArticleMetadata,
  clearFetchFailures,
  proxyHealth,
} from "~/utils/article/tools";
import { proxyProblemSummary } from "~/utils/net/proxyHealth";
import { useSnackbar } from "notistack";
import { useTranslation } from "react-i18next";
import ArticleComponent from "./ArticleComponent";
import TextToSpeechDrawer from "./TextToSpeechDrawer";
import { useTextToSpeech } from "~/hooks/useTextToSpeech";
import {
  getFontSizeFromCookie,
  setFontSizeInCookie,
  getThemeFromCookie,
  setThemeInCookie,
  ThemeMode,
  getFontFamilyFromCookie,
  setFontFamilyInCookie,
  FONT_FAMILY_OPTIONS,
  FontFamily,
} from "~/utils/cookies";
import { getHeaderHidingFromCookie } from "~/utils/cookies";
import { getFilePathContent, getFilePathRaw, getFileFetchLog, getFilePathPdf, getFilePathImage, mimeToExt } from "../../lib/src/lib";
import { ReadingSessionTracker } from "../../lib/src/readingSpeed";
import { recordReadingSession, useReadingWpm } from "../utils/readingSpeed";
import { formatReadTime } from "../../lib/src/lib";
import { calculateArticleStorageSize, formatBytes } from "~/utils/sync/storage";
import { ingestUrl } from "../../lib/src/ingestion";
import { recordLog, errorMessage } from "~/utils/logging";
import { useFailureReport } from "~/hooks/useFailureReport";
import { normalizeUrl } from "~/utils/net/url";
import { shareArticle } from "~/utils/share";
import FailureReportDialog from "./FailureReportDialog";
import {
  summarizeText,
  buildSummarySettings,
  getProviderConfig,
  getEffectiveSummaryModel,
  type SummarizationProgress,
} from "~/utils/ai/summarization";
import {
  getSummarizationEnabledFromCookie,
  getSummaryProviderFromCookie,
  getSummaryCustomBaseUrlFromCookie,
  getApiKeyForProvider,
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
  const { t } = useTranslation();
  const { pendingFailureReport, reportFailure, dismissFailureReport } = useFailureReport();

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
  const [stylesDrawerOpen, setStylesDrawerOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getThemeFromCookie());
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => getFontFamilyFromCookie());
  const currentFontCss = FONT_FAMILY_OPTIONS.find((o) => o.value === fontFamily)?.css;
  const fontFamilyLabels: Record<FontFamily, string> = {
    sans: t("article.fontFamilySans"),
    serif: t("article.fontFamilySerif"),
    humanist: t("article.fontFamilyHumanist"),
    mono: t("article.fontFamilyMono"),
  };
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

  // Always-current storage handle so the reading-session finalize callback can
  // persist remotely without re-running (and thus restarting) its effect.
  const storageRef = useRef(storage);
  storageRef.current = storage;

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

  // Word count of the article body, used to convert reading progress into the
  // number of words actually read for the adaptive reading-speed estimate.
  const wordCount = useMemo(
    () => (articleText ? articleText.split(/\s+/).filter(Boolean).length : 0),
    [articleText]
  );

  const readingWpm = useReadingWpm();

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
      enqueueSnackbar(t("article.storageNotReady"), { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, {
        favorite: !article.favorite,
      });
      enqueueSnackbar(article.favorite ? t("article.removedFromFavorites") : t("article.addedToFavorites"));
    } catch (e) {
      console.error(e);
      enqueueSnackbar(t("article.failedToUpdateFavorite"), { variant: "error" });
    }
  };

  const handleShare = async () => {
    closeMenu();
    if (!article.url) return;

    const outcome = await shareArticle(article.url, article.title);
    if (outcome === "copied") {
      enqueueSnackbar(t("article.urlCopied"));
    } else if (outcome === "failed") {
      enqueueSnackbar(t("article.failedToShare"), { variant: "error" });
    }
  };

  const handleDelete = async () => {
    try {
      await removeArticle(article.slug);
      navigate({ to: "/" });
      enqueueSnackbar(t("article.articleDeleted"));
    } catch (e) {
      console.error(e);
      enqueueSnackbar(t("article.failedToDelete"), { variant: "error" });
    }
  };

  const runSummarize = async (successMessage: string) => {
    if (!articleText) {
      enqueueSnackbar(t("article.noContentToSummarize"), { variant: "error" });
      return;
    }

    const provider = getSummaryProviderFromCookie();
    const model = getEffectiveSummaryModel(provider);
    const apiKey = getApiKeyForProvider(provider) || "";
    const baseUrl = getSummaryCustomBaseUrlFromCookie();
    const providerConfig = getProviderConfig(provider);

    if (providerConfig?.requiresApiKey && !apiKey) {
      enqueueSnackbar(t("article.setApiKey"), { variant: "warning" });
      return;
    }

    if (providerConfig?.isCustom && !baseUrl.trim()) {
      enqueueSnackbar(t("article.setServerUrl"), { variant: "warning" });
      return;
    }

    setIsSummarizing(true);
    setSummaryProgress({ status: "summarizing" });

    const settings = buildSummarySettings();

    try {
      // Patch only the summary fields — summarization can take long enough for
      // sync to have updated the article, so we must not overwrite other fields.
      const summary = await summarizeText(
        articleText,
        settings,
        provider,
        apiKey,
        model,
        (progress) => setSummaryProgress(progress),
        baseUrl,
      );
      const summaryMeta: SummaryMeta = {
        model,
        provider,
        generatedAt: new Date().toISOString(),
        detailLevel: settings.detailLevel,
      };
      await patchArticleMetadata(storage.client!, article.slug, { summary, summaryMeta });
      enqueueSnackbar(successMessage);
    } catch (error) {
      console.error("Summarization failed:", error);
      recordLog("error", "summary", "Manual summarization failed", {
        slug: article.slug,
        provider,
        model,
        error: errorMessage(error),
      });
      const detail = error instanceof Error ? error.message : t("article.unknownError");
      enqueueSnackbar(t("article.failedToGenerateSummary", { detail }), { variant: "error" });
    } finally {
      setIsSummarizing(false);
      setSummaryProgress(null);
    }
  };

  const handleSummarize = async () => {
    closeMenu();
    setSummaryDrawerOpen(true);
    if (article.summary) return;
    await runSummarize(t("article.summaryGenerated"));
  };

  const handleArchive = async () => {
    if (!storage.client) {
      enqueueSnackbar(t("article.storageNotReady"), { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, { state: "archived" });

      enqueueSnackbar(t("article.articleArchived"));
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar(t("article.failedToArchive"), { variant: "error" });
    }
  };

  const handleUnarchive = async () => {
    if (!storage.client) {
      enqueueSnackbar(t("article.storageNotReady"), { variant: "warning" });
      return;
    }
    try {
      await patchArticleMetadata(storage.client, article.slug, { state: "unread" });

      enqueueSnackbar(t("article.articleUnarchived"));
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar(t("article.failedToUnarchive"), { variant: "error" });
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
      enqueueSnackbar(t("article.noUrlToRefetch"), { variant: "error" });
      closeMenu();
      return;
    }

    const targetUrl = normalizeUrl(article.url);

    closeMenu();
    setRefetchDrawerOpen(true);
    setRefetchStatus(t("article.refetchStarting"));
    setRefetchPercent(0);

    // An explicit refetch is a deliberate "try again": forget any URLs the
    // governor is currently backing off from (e.g. dead images).
    await clearFetchFailures();

    // Only a failed download is reportable; later local failures are not.
    let ingestSucceeded = false;
    try {
      const updatedArticle = await ingestUrl(
        storage.client,
        targetUrl,
        (percent: number | null, message: string | null) => {
          if (percent !== null) {
            setRefetchStatus(message);
            setRefetchPercent(percent);
          }
        },
      );
      ingestSucceeded = true;

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
          setHtml(file.data);
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
        enqueueSnackbar(t("article.refetchSuccess"));
      }, 1000);
    } catch (error) {
      console.error("Refetch error:", error);
      setRefetchStatus(t("article.refetchFailed"));
      setTimeout(() => {
        setRefetchDrawerOpen(false);
        setRefetchPercent(0);
        setRefetchStatus(null);
        const proxyProblem = proxyHealth.getState().problem;
        enqueueSnackbar(
          proxyProblem
            ? t("common.proxyHealth.refetchFailed", {
                reason: proxyProblemSummary(t, proxyProblem),
              })
            : t("article.refetchFailed"),
          { variant: "error" }
        );
        if (!ingestSucceeded) {
          reportFailure(targetUrl, error, "Failed to refetch article");
        }
      }, 2000);
    }
  };

  const handleSaveEdit = async () => {
    if (!storage.client) {
      enqueueSnackbar(t("article.storageNotReady"), { variant: "warning" });
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
          setHtml(updatedHtml);
        } else {
          setHtml(updatedHtml);
        }

      setInfoDrawerOpen(false);
      enqueueSnackbar(t("article.infoUpdated"));
    } catch (e) {
      console.error(e);
      enqueueSnackbar(t("article.failedToUpdateInfo"), { variant: "error" });
    }
  };

  // Sticky hide-on-scroll header logic
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);

  // Scroll percentage tracking
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPercentage = useRef<number | null>(null);
  // Active reading-speed session for the currently open article. Null between
  // sessions (e.g. while the tab is hidden) so stray scroll events are ignored.
  const sessionTrackerRef = useRef<ReadingSessionTracker | null>(null);
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
      } else {
        const currentScrollY = window.scrollY;
        if (currentScrollY >= 0) {
          if (currentScrollY < 50) {
            setShowHeader(true);
          } else if (currentScrollY > lastScrollY.current) {
            setShowHeader(false);
          } else if (currentScrollY < lastScrollY.current) {
            setShowHeader(true);
          }
          lastScrollY.current = currentScrollY;
        }
      }

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set new timeout to log scroll percentage after 1 second of inactivity
      scrollTimeoutRef.current = setTimeout(async () => {
        const scrollTop = window.scrollY;
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercentage = Math.round((scrollTop / documentHeight) * 100);

        // Feed the reading-speed tracker: each settled scroll position marks a
        // point of activity, and the gap since the last one counts as reading
        // time (capped against idle gaps inside the tracker).
        sessionTrackerRef.current?.recordActivity(scrollPercentage, Date.now());

        // Only save if the percentage has changed
        if (scrollPercentage !== lastSavedPercentage.current) {
          lastSavedPercentage.current = scrollPercentage;

          // Always persist progress locally; also sync remotely when available.
          if (articleRef.current) {
            if (storage.client) {
              await patchArticleMetadata(
                storage.client,
                articleRef.current.slug,
                { progress: scrollPercentage },
                { skipPublicExport: true }
              );
            } else {
              await db.transaction("rw", db.articles, async () => {
                const current = await db.articles.get(articleRef.current!.slug);
                if (current) await db.articles.put({ ...current, progress: scrollPercentage });
              });
            }
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

  // Adaptive reading-speed session lifecycle. A session runs while the article
  // is open and the tab is visible; it is finalized (and folded into the learned
  // WPM) when the tab is hidden or the screen unmounts. Recreating the tracker
  // when the tab becomes visible again starts a fresh session and prevents the
  // same reading from being counted twice.
  useEffect(() => {
    if (!wordCount) return;

    const startSession = () => {
      sessionTrackerRef.current = new ReadingSessionTracker(wordCount);
    };

    const finalizeSession = () => {
      const tracker = sessionTrackerRef.current;
      if (!tracker) return;
      // Detach first so a follow-on finalize (hidden -> unmount) is a no-op.
      sessionTrackerRef.current = null;

      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        documentHeight > 0 ? Math.round((window.scrollY / documentHeight) * 100) : 0;
      // Final activity marker captures the time spent on the last segment read.
      tracker.recordActivity(progress, Date.now());

      const session = tracker.getSession();
      if (!session) return;

      const { wpm: measuredWpm } = recordReadingSession(session);

      // Persist the measured pace on the article so other devices can bootstrap
      // their own estimate from it. Mirrors how scroll progress is saved.
      if (measuredWpm != null && articleRef.current) {
        const targetSlug = articleRef.current.slug;
        const rounded = Math.round(measuredWpm);
        const client = storageRef.current.client;
        if (client) {
          void patchArticleMetadata(
            client,
            targetSlug,
            { readingWpm: rounded },
            { skipPublicExport: true }
          );
        } else {
          void db.transaction("rw", db.articles, async () => {
            const current = await db.articles.get(targetSlug);
            if (current) await db.articles.put({ ...current, readingWpm: rounded });
          });
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        finalizeSession();
      } else if (document.visibilityState === "visible" && !sessionTrackerRef.current) {
        startSession();
      }
    };

    startSession();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      finalizeSession();
    };
  }, [slug, wordCount]);

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
            setHtml(file.data);
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
        const scrollPosition = (progress / 100) * documentHeight;
        if (documentHeight > 0) {
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
    const summaryLinkHtml = ` · <a id="savr-summary-link-anchor" href="#" style="color: inherit; text-decoration: underline; cursor: pointer;">${t("article.viewSummary")}</a>`;

    // Find the savr-readTime div and append the link inside it
    return html.replace(
      /(<div id="savr-readTime"[^>]*>)(.*?)(<\/div>)/,
      `$1$2${summaryLinkHtml}$3`
    );
  }, [html, article.summary, t]);

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

          <Tooltip title={t("article.readingStyles")}>
            <IconButton
              color="inherit"
              onClick={() => setStylesDrawerOpen(true)}
            >
              <FormatSizeIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={t("article.listenToArticle")}>
            <IconButton
              color="inherit"
              onClick={() => setTtsDrawerOpen(true)}
              data-testid="tts-button"
            >
              <HeadphonesIcon />
            </IconButton>
          </Tooltip>

          {article.state === "archived" ? (
            <Tooltip title={t("article.unarchive")}>
              <IconButton color="inherit" onClick={handleUnarchive}>
                <UnarchiveIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={t("article.archive")}>
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
                <ListItemText>{t("article.showOriginal")}</ListItemText>
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
                <ListItemText>{t("article.showCleaned")}</ListItemText>
              </MenuItem>
            )}

            <MenuItem onClick={handleVisitOriginal} sx={{ py: 1 }}>
              <ListItemIcon>
                <OpenInNewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("article.visitOriginal")}</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleEditInfo} sx={{ py: 1 }}>
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("article.editInfo")}</ListItemText>
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
              <ListItemText>{t("article.refetch")}</ListItemText>
            </MenuItem>
            {/* Only show Summarize option if summarization is enabled */}
            {getSummarizationEnabledFromCookie() && (
              <MenuItem onClick={handleSummarize} sx={{ py: 1 }}>
                <ListItemIcon>
                  <AutoAwesomeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{article.summary ? t("article.viewSummary") : t("article.summarize")}</ListItemText>
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
              <ListItemText>{article.favorite ? t("article.unmarkFavorite") : t("article.markFavorite")}</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleShare} sx={{ py: 1 }} data-testid="article-page-menu-share">
              <ListItemIcon>
                <ShareIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("article.share")}</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleDelete} sx={{ py: 1 }} data-testid="article-page-menu-delete">
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{t("article.delete")}</ListItemText>
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
              title={article.title || t("article.pdfDocument")}
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
              alt={article.title || t("article.imageAlt")}
              style={{
                maxWidth: "100%",
                maxHeight: "calc(100vh - 96px)",
                objectFit: "contain",
              }}
            />
          </Box>
        ) : (
          <ArticleComponent html={htmlWithSummaryLink} fontSize={fontSize} fontFamily={currentFontCss} />
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
            {t("article.articleInfo")}
          </Typography>

          {/* Editable fields */}
          <Stack spacing={3}>
            <TextField
              label={t("article.title")}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              fullWidth
              variant="outlined"
            />

            <TextField
              label={t("article.author")}
              value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              fullWidth
              variant="outlined"
            />

            {/* Read-only metadata section */}
            <Box>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  <strong>{t("article.size")}:</strong>{" "}
                  {article.sizeBytes != null
                    ? formatBytes(article.sizeBytes)
                    : storageSize
                      ? formatBytes(storageSize.totalSize)
                      : t("article.calculating")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>{t("article.offlineResources")}:</strong>{" "}
                  {article.assetCount != null
                    ? t("article.filesCount", {
                        count: article.assetCount,
                        files: article.assetCount.toLocaleString(),
                      })
                    : storageSize
                      ? t("article.filesCount", {
                          count: storageSize.files.filter((f) => f.path.includes("/resources/")).length,
                          files: storageSize.files
                            .filter((f) => f.path.includes("/resources/"))
                            .length.toLocaleString(),
                        })
                      : t("article.calculating")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>{t("article.saved")}:</strong>{" "}
                  {article.ingestDate
                    ? `${new Date(article.ingestDate).toISOString().replace("T", " ").replace("Z", "")} UTC`
                    : t("article.unknown")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>{t("article.contentType")}:</strong> {article.mimeType || t("article.unknown")}
                </Typography>
                {wordCount > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>{t("article.readingTime")}:</strong>{" "}
                    {formatReadTime(Math.max(1, Math.ceil(wordCount / readingWpm)))} (
                    {t("article.wordsCount", { count: wordCount, words: wordCount.toLocaleString() })})
                  </Typography>
                )}
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
                  {t("article.ingestionLog")}
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
                {t("article.cancel")}
              </Button>
              <Button variant="contained" onClick={handleSaveEdit}>
                {t("article.save")}
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
            {t("article.refetchingArticle")}
          </Typography>
          {refetchStatus && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {refetchStatus}
            </Typography>
          )}
          <LinearProgress variant="determinate" value={refetchPercent} />
        </Box>
      </Drawer>

      {/* Styles Drawer */}
      <Drawer
        anchor="bottom"
        open={stylesDrawerOpen}
        onClose={() => setStylesDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            bgcolor: "background.paper",
            color: "text.primary",
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
            {t("article.readingStyles")}
          </Typography>

          {/* Theme mode */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, justifyContent: "center" }}>
            {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
              const selected = currentTheme === mode;
              const icon =
                mode === "light" ? (
                  <LightModeIcon />
                ) : mode === "dark" ? (
                  <DarkModeIcon />
                ) : (
                  <SettingsBrightnessIcon />
                );
              const label =
                mode === "light"
                  ? t("article.themeLight")
                  : mode === "dark"
                    ? t("article.themeDark")
                    : t("article.themeSystem");
              return (
                <Box
                  key={mode}
                  onClick={() => {
                    if (currentTheme !== mode) {
                      setThemeInCookie(mode);
                      setCurrentTheme(mode);
                      window.dispatchEvent(new CustomEvent("themeChanged"));
                    }
                  }}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      border: selected ? "2px solid" : "2px solid",
                      borderColor: selected ? "primary.main" : "divider",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: selected ? "primary.main" : "transparent",
                      color: selected ? "primary.contrastText" : "text.secondary",
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    {icon}
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ color: selected ? "primary.main" : "text.secondary" }}
                  >
                    {label}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Font size */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <IconButton
              onClick={() => {
                const newSize = Math.max(12, fontSize - 2);
                setFontSize(newSize);
                setFontSizeInCookie(newSize);
              }}
            >
              <RemoveIcon />
            </IconButton>
            <Typography sx={{ minWidth: 60, textAlign: "center", fontSize }}>
              A
            </Typography>
            <IconButton
              onClick={() => {
                const newSize = Math.min(32, fontSize + 2);
                setFontSize(newSize);
                setFontSizeInCookie(newSize);
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>

          {/* Font family */}
          <Box sx={{ pt: 2, borderTop: "1px solid", borderColor: "divider", mt: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>{t("article.font")}</InputLabel>
              <Select
                value={fontFamily}
                label={t("article.font")}
                onChange={(e) => {
                  const val = e.target.value as FontFamily;
                  setFontFamily(val);
                  setFontFamilyInCookie(val);
                }}
              >
                {FONT_FAMILY_OPTIONS.map((opt) => (
                  <SelectMenuItem key={opt.value} value={opt.value} sx={{ fontFamily: opt.css }}>
                    {fontFamilyLabels[opt.value]}
                  </SelectMenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
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
            {t("article.summary")}
          </Typography>

          {isSummarizing && (
            <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                {t("article.generatingSummary")}
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
              {article.summaryMeta && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 2 }}
                >
                  {t("article.generatedBy", { model: article.summaryMeta.model })}
                  {article.summaryMeta.provider ? ` (${article.summaryMeta.provider})` : ""}
                  {article.summaryMeta.generatedAt
                    ? ` · ${new Date(article.summaryMeta.generatedAt).toLocaleString()}`
                    : ""}
                </Typography>
              )}
            </Box>
          )}

          {!isSummarizing && !article.summary && (
            <Typography variant="body2" color="text.secondary">
              {t("article.noSummary")}
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
                        summaryMeta: undefined,
                      });
                      enqueueSnackbar(t("article.summaryCleared"));
                    }}
                  >
                    {t("article.clear")}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => runSummarize(t("article.summaryRegenerated"))}
                  >
                    {t("article.regenerate")}
                  </Button>
                </>
              )}
              {!article.summary && !isSummarizing && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => runSummarize(t("article.summaryGenerated"))}
                >
                  {t("article.generateSummary")}
                </Button>
              )}
            </Box>
            <Button variant="outlined" onClick={() => setSummaryDrawerOpen(false)}>
              {t("article.close")}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Failure report offer (only rendered on a failed refetch) */}
      {pendingFailureReport && (
        <FailureReportDialog payload={pendingFailureReport} onClose={dismissFailureReport} />
      )}
    </Box>
  );
}
