import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListSubheader,
  TextField,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Paper,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Switch,
  Chip,
  Slider,
  Select,
  MenuItem as MuiMenuItem,
  FormControl,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import {
  ArrowBack as ArrowBackIcon,
  BookmarkAdd as BookmarkAddIcon,
  Web as WebIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
  Article as ArticleIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Help as HelpIcon,
  Storage as StorageIcon,
  Sync as SyncIcon,
  DragHandle as DragHandleIcon,
  AutoAwesome as AutoAwesomeIcon,
  Public as PublicIcon,
  Insights as InsightsIcon,
  Speed as SpeedIcon,
  Refresh as RefreshIcon,
  Extension as ExtensionIcon,
} from "@mui/icons-material";
import { getStoredCorsProxy, setCorsProxyValue } from "~/utils/net/corsProxy";
import { getDefaultCorsProxy, getExtensionUrls, isTelemetryConfigured } from "~/config/environment";
import { hasGlobalPrivacyControl } from "~/utils/telemetry";
// Single source of truth: browser-extension/youtube-transcript.js — the same
// function the extension serializes into YouTube tabs — wrapped into a
// bookmarklet at build time by the minify-bookmarklet Vite plugin. The
// placeholder SAVR origin "__SAVR_ORIGIN__" is substituted with the app's
// origin below.
import ytTranscriptBookmarkletSource from "../../browser-extension/youtube-transcript.js?bookmarklet";
import {
  getThemeFromCookie,
  toggleTheme,
  useSystemThemeListener,
  getEffectiveTheme,
  getHeaderHidingFromCookie,
  setHeaderHidingInCookie,
  getTelemetryEnabledFromCookie,
  setTelemetryEnabledInCookie,
  getAfterExternalSaveFromCookie,
  setAfterExternalSaveInCookie,
  getSummarizationEnabledFromCookie,
  setSummarizationEnabledInCookie,
  getSummaryProviderFromCookie,
  setSummaryProviderInCookie,
  getSummaryModelForProvider,
  setSummaryModelForProvider,
  getSummaryCustomBaseUrlFromCookie,
  setSummaryCustomBaseUrlInCookie,
  getApiKeyForProvider,
  setApiKeyForProvider,
  getSummarySettingsFromCookie,
  setSummarySettingsInCookie,
  AFTER_EXTERNAL_SAVE_ACTIONS,
  AfterExternalSaveAction,
} from "~/utils/cookies";
import {
  PROVIDERS,
  DETAIL_LEVELS,
  TONE_OPTIONS,
  FOCUS_OPTIONS,
  FORMAT_OPTIONS,
  DEFAULT_SUMMARY_SETTINGS,
  testApiConnection,
  fetchAvailableModels,
  pickDefaultModel,
  getProviderConfig,
  type SummaryProvider,
  type DetailLevel,
  type AvailableModel,
} from "~/utils/ai/summarization";
import { isPWAMode, isTouchOnlyDevice } from "~/utils/net/network";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import {
  calculateStorageUsage,
  clearLocalRemoteStorageCache,
  formatBytes,
  updateSyncInterval,
} from "~/utils/sync/storage";
import { version } from "../../package.json" with { type: "json" };
import { BUILD_TIMESTAMP } from "~/config/environment";
import {
  setSyncEnabledCookie,
  SYNC_ENABLED_COOKIE_NAME,
  getSyncIntervalFromCookie,
  setSyncIntervalInCookie,
  SYNC_INTERVAL_OPTIONS,
  DEFAULT_SYNC_INTERVAL_MS,
} from "~/utils/cookies";
import { formatReadTime } from "../../lib/src/lib";
import { DEFAULT_WPM } from "../../lib/src/readingSpeed";
import { useReadingWpm, getReadingSpeedState, resetReadingSpeed } from "../utils/readingSpeed";
import {
  getPublicExportState,
  subscribePublicExport,
  enablePublicExport,
  disablePublicExport,
  publishNow,
  type PublicExportState,
} from "~/utils/article/publicExport";

// Where to install the browser extension (build-configurable, see environment.ts).
const extensionUrls = getExtensionUrls();

// Small pill links for the extension install targets.
const extensionLinkStyle: React.CSSProperties = {
  color: "inherit",
  textDecoration: "none",
  fontWeight: "bold",
  padding: "8px 12px",
  border: "1px solid",
  borderColor: "currentColor",
  borderRadius: "4px",
  display: "inline-block",
};

// A labelled setting whose control sits below the label. Indented to line up
// with icon rows on wider screens; full width on phones where every pixel counts.
function SettingField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ListItem sx={{ display: "block", pl: { xs: 2, sm: 9 }, py: 1 }}>
      <ListItemText primary={label} secondary={hint} sx={{ mt: 0, mb: 1 }} />
      {children}
    </ListItem>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  size,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "small" | "medium";
}) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          onClick={() => onChange(option.value)}
          variant={value === option.value ? "filled" : "outlined"}
          color={value === option.value ? "primary" : "default"}
          size={size}
        />
      ))}
    </Box>
  );
}

// For rows with a trailing control: on phones the control drops below the
// text instead of squeezing it into a one-word-wide column.
const wrappingRowSx = {
  flexWrap: "wrap",
  // Zero basis keeps the text beside its icon; only the control wraps.
  "& > .MuiListItemText-root": { flex: "1 1 0", minWidth: 0 },
} as const;
const trailingControlSx = {
  flexBasis: { xs: "100%", sm: "auto" },
  pl: { xs: 7, sm: 0 },
  ml: { xs: 0, sm: 2 },
  mt: { xs: 1, sm: 0 },
} as const;

export default function PreferencesScreen() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());
  const [corsProxy, setCorsProxy] = React.useState<string>("");
  const [isCustomCorsProxy, setIsCustomCorsProxy] = React.useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState<boolean>(true);
  const [syncInterval, setSyncInterval] = React.useState<number>(DEFAULT_SYNC_INTERVAL_MS);
  const [headerHidingEnabled, setHeaderHidingEnabled] = React.useState<boolean>(false);
  const [telemetryEnabled, setTelemetryEnabled] = React.useState<boolean>(true);
  // Browser-level GPC overrides the site preference; computed once on mount.
  const [gpcActive] = React.useState<boolean>(() => hasGlobalPrivacyControl());
  const [afterExternalSave, setAfterExternalSave] = React.useState<AfterExternalSaveAction>(
    AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST,
  );
  const [storageUsage, setStorageUsage] = useState<{
    size: number;
    articles: number;
    files: number;
  } | null>(null);
  const [publicExportState, setPublicExportState] =
    useState<PublicExportState>(getPublicExportState);
  const [summarizationEnabled, setSummarizationEnabled] = useState<boolean>(false);
  const [summaryProvider, setSummaryProvider] = useState<SummaryProvider>("groq");
  const [summaryModel, setSummaryModel] = useState<string>("");
  const [summaryBaseUrl, setSummaryBaseUrl] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [summarySettings, setSummarySettings] = useState(DEFAULT_SUMMARY_SETTINGS);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bookmarklet, setBookmarklet] = React.useState<string>("");
  const bookmarkletRef = React.useRef<HTMLAnchorElement>(null);
  const ytTranscriptBookmarkletRef = React.useRef<HTMLAnchorElement>(null);

  // Bookmarklets and extensions only make sense in a desktop browser tab —
  // not in the installed PWA, nor on phones/tablets without a mouse.
  const showDesktopSaveTools = !isPWAMode() && !isTouchOnlyDevice();

  const { connected: rsConnected } = useRemoteStorage();
  const { enqueueSnackbar } = useSnackbar();

  const buildDate =
    new Date(BUILD_TIMESTAMP).toDateString() + " " + new Date(BUILD_TIMESTAMP).toLocaleTimeString();

  React.useEffect(() => {
    return subscribePublicExport(setPublicExportState);
  }, []);

  React.useEffect(() => {
    // Reads localStorage, migrating (and deleting) any legacy cookie value.
    const customValue = getStoredCorsProxy();
    const defaultValue = getDefaultCorsProxy();

    if (customValue) {
      setCorsProxy(customValue);
      setIsCustomCorsProxy(true);
    } else {
      setCorsProxy(defaultValue);
      setIsCustomCorsProxy(false);
    }

    // Load sync setting from cookies
    const syncCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${SYNC_ENABLED_COOKIE_NAME}=`));
    if (syncCookie) {
      const syncValue = syncCookie.split("=")[1];
      setSyncEnabled(syncValue === "true");
    }

    setSyncInterval(getSyncIntervalFromCookie());

    // Load header hiding setting from cookies
    setHeaderHidingEnabled(getHeaderHidingFromCookie());
    setTelemetryEnabled(getTelemetryEnabledFromCookie());

    // Load after external save setting from cookies
    setAfterExternalSave(getAfterExternalSaveFromCookie());

    // Load summarization settings from cookies
    setSummarizationEnabled(getSummarizationEnabledFromCookie());
    const savedProvider = getSummaryProviderFromCookie() as SummaryProvider;
    setSummaryProvider(savedProvider);
    setSummaryModel(getSummaryModelForProvider(savedProvider));
    setSummaryBaseUrl(getSummaryCustomBaseUrlFromCookie());
    const savedKey = getApiKeyForProvider(savedProvider);
    if (savedKey) setApiKey(savedKey);
    const savedSettings = getSummarySettingsFromCookie();
    setSummarySettings({
      detailLevel: savedSettings.detailLevel as DetailLevel,
      tone: savedSettings.tone as typeof DEFAULT_SUMMARY_SETTINGS.tone,
      focus: savedSettings.focus as typeof DEFAULT_SUMMARY_SETTINGS.focus,
      format: savedSettings.format as typeof DEFAULT_SUMMARY_SETTINGS.format,
      customPrompt: savedSettings.customPrompt,
    });

    const saveRoute = window.location.origin + "/";
    console.log("Absolute path to index for saving:", saveRoute);

    setBookmarklet(
      `data:text/html,<html><body><script>var url=encodeURIComponent(window.location.href);window.open('${saveRoute}?saveUrl='+url,'_blank');</script></body></html>`,
    );
  }, []);

  // Set the javascript: URL directly on the DOM element
  React.useEffect(() => {
    if (bookmarkletRef.current) {
      const origin = window.location.origin;

      // const bookmarkletJS = `javascript:(function(){var url=encodeURIComponent(window.location.href);window.open('${origin}/?saveUrl='+url,'_blank');})();`;

      const storePageScript = `
        const savrWindow = window.open('${origin}/?bookmarklet=' + encodeURIComponent(window.location.href),'_blank');
        const interval = setInterval(() => {
          if (savrWindow.closed) {
            clearInterval(interval);
            alert("Article saved successfully!");
            return;
          }
          const htmlString = document.documentElement.outerHTML;
          savrWindow.postMessage({ action: "savr-html", url: window.location.href, html: htmlString }, '${origin}');
        }, 100);
      `;

      const bookmarkletJS = `javascript:(function(){${storePageScript}})();`;
      bookmarkletRef.current.href = bookmarkletJS;
    }

    // YouTube transcript bookmarklet: scrapes the transcript on the page and
    // sends it to Savr as raw content (savr-raw), bypassing Readability.
    // Script body comes from browser-extension/youtube-transcript.js.
    if (ytTranscriptBookmarkletRef.current) {
      const origin = window.location.origin;
      ytTranscriptBookmarkletRef.current.href = `javascript:${ytTranscriptBookmarkletSource.replace(
        '"__SAVR_ORIGIN__"',
        JSON.stringify(origin),
      )}`;
    }
  }, []);
  const navigate = useNavigate();

  // Article count queries
  const unreadCount = useLiveQuery(() => db.articles.where("state").equals("unread").count());
  const archivedCount = useLiveQuery(() => db.articles.where("state").equals("archived").count());

  // Learned reading speed (re-renders when updated after a reading session).
  const readingWpm = useReadingWpm();
  const readingSpeedSampleCount = getReadingSpeedState().sampleCount;

  // Read time sum queries
  const unreadWordCountSum = useLiveQuery(async () => {
    const unreadArticles = await db.articles.where("state").equals("unread").toArray();
    return unreadArticles.reduce((sum, article) => sum + (article.wordCount || 0), 0);
  });
  const archivedWordCountSum = useLiveQuery(async () => {
    const archivedArticles = await db.articles.where("state").equals("archived").toArray();
    return archivedArticles.reduce((sum, article) => sum + (article.wordCount || 0), 0);
  });

  const totalArticleCount = useLiveQuery(() => db.articles.count());

  // Calculate storage usage
  React.useEffect(() => {
    const calculateUsage = async () => {
      try {
        const usage = await calculateStorageUsage();
        setStorageUsage(usage);
      } catch (error) {
        console.error("Failed to calculate storage usage:", error);
      }
    };

    calculateUsage();
  }, []);

  const handleDeleteAllArticles = async () => {
    try {
      await db.articles.clear();
      await clearLocalRemoteStorageCache();

      setDeleteDialogOpen(false);

      enqueueSnackbar("All articles deleted successfully!", { variant: "success" });
    } catch (error) {
      console.error("Error deleting all articles:", error);
      enqueueSnackbar("Failed to delete articles", { variant: "error" });
    }
  };

  // Listen for theme changes from other components
  React.useEffect(() => {
    const handleThemeChange = () => {
      setCurrentTheme(getThemeFromCookie());
    };

    window.addEventListener("themeChanged", handleThemeChange);
    return () => {
      window.removeEventListener("themeChanged", handleThemeChange);
    };
  }, []);

  // Listen for system theme changes
  useSystemThemeListener();

  const handleBack = () => {
    navigate({ to: "/" });
  };

  const handleThemeToggle = () => {
    const newTheme = toggleTheme();
    setCurrentTheme(newTheme);
    // Dispatch event to notify theme change
    window.dispatchEvent(new CustomEvent("themeChanged"));
  };

  const handleCorsProxyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setCorsProxy(value);

    // If user enters a value different from default, mark as custom
    if (value !== getDefaultCorsProxy()) {
      setIsCustomCorsProxy(true);
      setCorsProxyValue(value || null);
    } else {
      // If user enters the default value, clear the custom setting
      setIsCustomCorsProxy(false);
      setCorsProxyValue(null);
    }
  };

  const handleCorsProxyFocus = () => {
    // When user focuses on the field, show the current value for editing
    if (!isCustomCorsProxy) {
      setCorsProxy(getDefaultCorsProxy());
    }
  };

  const handleCorsProxyBlur = () => {
    // When user leaves the field, if they haven't entered a custom value, show default greyed out
    if (!isCustomCorsProxy) {
      setCorsProxy(getDefaultCorsProxy());
    }
  };

  const handleSyncIntervalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const ms = parseInt(event.target.value);
    setSyncInterval(ms);
    setSyncIntervalInCookie(ms);
    updateSyncInterval(ms);
  };

  const handleSyncToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setSyncEnabled(newValue);
    setSyncEnabledCookie(newValue);

    // Only refresh when enabling sync to properly initialize the widget
    if (newValue) {
      window.location.reload();
    }
  };

  const handleHeaderHidingToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHeaderHidingEnabled(newValue);
    setHeaderHidingInCookie(newValue);
  };

  const handleTelemetryToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setTelemetryEnabled(newValue);
    setTelemetryEnabledInCookie(newValue);
    // Takes full effect on next load: opting in loads the tracker then; opting
    // out stops all future events immediately (each event re-checks consent).
  };

  const handleAfterExternalSaveChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value as AfterExternalSaveAction;
    setAfterExternalSave(newValue);
    setAfterExternalSaveInCookie(newValue);
  };

  const handleSummarizationToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setSummarizationEnabled(newValue);
    setSummarizationEnabledInCookie(newValue);
    if (newValue) {
      enqueueSnackbar("Summarization enabled");
    } else {
      enqueueSnackbar("Summarization disabled");
    }
  };

  // Each fetch gets an id so a slow response for stale credentials can't
  // overwrite the list from a newer one.
  const modelsRequestId = React.useRef(0);

  const handleProviderChange = (provider: SummaryProvider) => {
    setSummaryProvider(provider);
    setSummaryProviderInCookie(provider);
    // Load API key and model for this provider
    const savedKey = getApiKeyForProvider(provider);
    setApiKey(savedKey || "");
    setSummaryModel(getSummaryModelForProvider(provider));
    // Fetched model list belongs to the previous provider — drop it, and
    // invalidate any in-flight fetch so it can't land on the new provider.
    setAvailableModels([]);
    modelsRequestId.current++;
    setIsFetchingModels(false);
  };

  // Fetch the provider's model list and, if the current model isn't in it,
  // switch to a sensible default. Resolves to the model now in use. `silent` is
  // for background refreshes (key entered, Test pressed) — those shouldn't
  // toast on every keystroke.
  const loadModels = async ({ silent }: { silent: boolean }): Promise<string> => {
    const providerConfig = getProviderConfig(summaryProvider);
    if (providerConfig?.requiresApiKey && !apiKey.trim()) {
      if (!silent) enqueueSnackbar("Please enter an API key first", { variant: "warning" });
      return summaryModel;
    }
    if (providerConfig?.isCustom && !summaryBaseUrl.trim()) {
      if (!silent) enqueueSnackbar("Please enter a server URL first", { variant: "warning" });
      return summaryModel;
    }
    const requestId = ++modelsRequestId.current;
    setIsFetchingModels(true);
    try {
      const models = await fetchAvailableModels(summaryProvider, apiKey, summaryBaseUrl);
      if (requestId !== modelsRequestId.current) return summaryModel;
      if (models.length === 0) {
        if (!silent) enqueueSnackbar("Provider returned no models", { variant: "warning" });
        return summaryModel;
      }
      setAvailableModels(models);
      const model = pickDefaultModel(summaryProvider, models, summaryModel);
      if (model !== summaryModel) handleModelChange(model);
      if (!silent) enqueueSnackbar(`Found ${models.length} models`, { variant: "success" });
      return model;
    } catch (error) {
      if (!silent && requestId === modelsRequestId.current) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        enqueueSnackbar(`Could not fetch models: ${detail}`, { variant: "error" });
      }
      return summaryModel;
    } finally {
      if (requestId === modelsRequestId.current) setIsFetchingModels(false);
    }
  };

  const handleRefreshModels = () => loadModels({ silent: false });

  // Proactively (re)load models whenever the credentials change — including
  // on first render with a saved key. Debounced so typing a key doesn't fire
  // a request per keystroke.
  React.useEffect(() => {
    if (!summarizationEnabled) return;
    const timer = setTimeout(() => void loadModels({ silent: true }), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarizationEnabled, summaryProvider, apiKey, summaryBaseUrl]);

  function handleModelChange(model: string) {
    setSummaryModel(model);
    setSummaryModelForProvider(summaryProvider, model);
  }

  const handleBaseUrlChange = (url: string) => {
    setSummaryBaseUrl(url);
    setSummaryCustomBaseUrlInCookie(url);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    setApiKeyForProvider(summaryProvider, key || null);
  };

  const handleTestApiConnection = async () => {
    const providerConfig = getProviderConfig(summaryProvider);
    if (providerConfig?.requiresApiKey && !apiKey.trim()) {
      enqueueSnackbar("Please enter an API key first", { variant: "warning" });
      return;
    }
    if (providerConfig?.isCustom && !summaryBaseUrl.trim()) {
      enqueueSnackbar("Please enter a server URL first", { variant: "warning" });
      return;
    }
    setIsTestingApi(true);
    try {
      // Refresh the model list first: it picks a model if none is chosen yet,
      // and is useful even when the selected model is why the test fails.
      const model = (await loadModels({ silent: true })) || summaryModel;
      if (!model) {
        enqueueSnackbar("Choose a model first", { variant: "warning" });
        return;
      }
      const result = await testApiConnection(summaryProvider, apiKey, model, summaryBaseUrl);
      if (result.success) {
        enqueueSnackbar("API connection successful!", { variant: "success" });
      } else {
        enqueueSnackbar(`API error: ${result.error}`, { variant: "error" });
      }
    } catch {
      enqueueSnackbar("Failed to test API connection", { variant: "error" });
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleSettingChange = <K extends keyof typeof summarySettings>(
    key: K,
    value: (typeof summarySettings)[K],
  ) => {
    const newSettings = { ...summarySettings, [key]: value };
    setSummarySettings(newSettings);
    setSummarySettingsInCookie(newSettings);
  };

  const getThemeIcon = () => {
    switch (currentTheme) {
      case "light":
        return <LightModeIcon />;
      case "dark":
        return <DarkModeIcon />;
      case "system":
        return <SettingsBrightnessIcon />;
      default:
        return <LightModeIcon />;
    }
  };

  const getThemeLabel = () => {
    switch (currentTheme) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      case "system":
        return "System";
      default:
        return "Light";
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
            Preferences
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Container maxWidth="md" sx={{ mt: 2 }}>
        <Paper elevation={1}>
          {/* Fetching Content Section */}
          <List>
            <ListSubheader>Fetching content</ListSubheader>

            {showDesktopSaveTools && (
              <ListItem sx={wrappingRowSx}>
                <ListItemIcon>
                  <BookmarkAddIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Bookmarklet"
                  secondary="Drag this link to your bookmarks bar"
                />
                <Box sx={trailingControlSx}>
                  <a
                    ref={bookmarkletRef}
                    // draggable="true"
                    style={{
                      color: "primary.main",
                      textDecoration: "none",
                      fontWeight: "bold",
                      padding: "8px 12px",
                      border: "1px solid",
                      borderColor: "primary.main",
                      borderRadius: "4px",
                      display: "inline-block",
                    }}
                  >
                    savr save 🟣
                  </a>
                </Box>
              </ListItem>
            )}

            {showDesktopSaveTools && (
              <ListItem sx={wrappingRowSx}>
                <ListItemIcon>
                  <BookmarkAddIcon />
                </ListItemIcon>
                <ListItemText
                  primary="YouTube transcript bookmarklet"
                  secondary="Drag to your bookmarks bar — saves a YouTube video's transcript"
                />
                <Box sx={trailingControlSx}>
                  <a
                    ref={ytTranscriptBookmarkletRef}
                    style={{
                      color: "primary.main",
                      textDecoration: "none",
                      fontWeight: "bold",
                      padding: "8px 12px",
                      border: "1px solid",
                      borderColor: "primary.main",
                      borderRadius: "4px",
                      display: "inline-block",
                    }}
                  >
                    savr yt transcript 🔴
                  </a>
                </Box>
              </ListItem>
            )}

            {showDesktopSaveTools && (extensionUrls.firefoxUrl || extensionUrls.chromeUrl) && (
              <ListItem sx={wrappingRowSx}>
                <ListItemIcon>
                  <ExtensionIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Browser extension"
                  secondary="Save the page you're reading from your browser's toolbar"
                />
                <Box sx={{ ...trailingControlSx, display: "flex", gap: 1 }}>
                  {extensionUrls.firefoxUrl && (
                    <a
                      href={extensionUrls.firefoxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={extensionLinkStyle}
                      data-testid="extension-firefox-link"
                    >
                      Firefox
                    </a>
                  )}
                  {extensionUrls.chromeUrl && (
                    <a
                      href={extensionUrls.chromeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={extensionLinkStyle}
                      data-testid="extension-chrome-link"
                    >
                      Chrome
                    </a>
                  )}
                </Box>
              </ListItem>
            )}

            <ListItem sx={wrappingRowSx}>
              <ListItemIcon>
                <WebIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    CORS Proxy
                    <Tooltip title="CORS (Cross-Origin Resource Sharing) is a security feature that prevents websites from making requests to different domains. We need it to save articles from external websites. Using your own proxy can be more reliable and faster than public ones.">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" component="span">
                      Proxy server for cross-origin requests
                    </Typography>
                  </Box>
                }
              />
              <TextField
                value={corsProxy}
                onChange={handleCorsProxyChange}
                onFocus={handleCorsProxyFocus}
                onBlur={handleCorsProxyBlur}
                size="small"
                sx={{
                  ...trailingControlSx,
                  width: { xs: "100%", sm: "50%" },
                  "& .MuiInputBase-input": {
                    color: isCustomCorsProxy ? "text.primary" : "text.disabled",
                  },
                }}
              />
            </ListItem>

            <ListItem sx={wrappingRowSx}>
              <ListItemIcon>
                <BookmarkAddIcon />
              </ListItemIcon>
              <ListItemText
                primary="After external save"
                secondary="What to do after saving an article from a bookmarklet"
              />
              <Box sx={trailingControlSx}>
                <select
                  value={afterExternalSave}
                  onChange={handleAfterExternalSaveChange}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid rgba(128, 128, 128, 0.4)",
                    backgroundColor: "inherit",
                    color: "inherit",
                    fontSize: "14px",
                    minWidth: "150px",
                  }}
                >
                  <option value={AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_ARTICLE}>
                    Show article content
                  </option>
                  <option value={AFTER_EXTERNAL_SAVE_ACTIONS.SHOW_LIST}>Show article list</option>
                  <option value={AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB}>Close new tab</option>
                </select>
              </Box>
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <SyncIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Enable synchronization
                    <Tooltip title="Allows you to sync your articles across devices using a cloud service">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
              />
              <Switch edge="end" checked={syncEnabled} onChange={handleSyncToggle} />
            </ListItem>

            {syncEnabled && (
              <ListItem sx={wrappingRowSx}>
                <ListItemIcon>
                  <SyncIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Sync interval"
                  secondary="How often to poll for remote changes"
                />
                <Box sx={trailingControlSx}>
                  <select
                    value={syncInterval}
                    onChange={handleSyncIntervalChange}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid rgba(128, 128, 128, 0.4)",
                      backgroundColor: "inherit",
                      color: "inherit",
                      fontSize: "14px",
                      minWidth: "120px",
                    }}
                  >
                    {SYNC_INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Box>
              </ListItem>
            )}
          </List>

          {/* Reading Section */}
          <List>
            <ListSubheader>Reading</ListSubheader>

            <ListItem onClick={handleThemeToggle}>
              <ListItemIcon>{getThemeIcon()}</ListItemIcon>
              <ListItemText
                primary="Theme"
                secondary={`${getThemeLabel()} (${getEffectiveTheme(currentTheme) === "dark" ? "Dark" : "Light"})`}
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <DragHandleIcon />
              </ListItemIcon>
              <ListItemText
                primary="Auto-hide header while reading (experimental)"
                secondary="Automatically hide the header when scrolling down in articles"
              />
              <Switch
                edge="end"
                checked={headerHidingEnabled}
                onChange={handleHeaderHidingToggle}
              />
            </ListItem>
          </List>

          {/* Summarization Section */}
          <List>
            <ListSubheader>Summarization</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <AutoAwesomeIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Enable summarization
                    <Tooltip title="Generate a summary when saving an article, using a language model from the provider you choose — a cloud service or your own server.">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
                secondary={
                  summarizationEnabled
                    ? "Summaries will be generated for new articles"
                    : "Summaries are disabled"
                }
              />
              <Switch
                edge="end"
                checked={summarizationEnabled}
                onChange={handleSummarizationToggle}
              />
            </ListItem>

            {summarizationEnabled && (
              <>
                <SettingField label="LLM Provider">
                  <ChipGroup
                    options={PROVIDERS.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    value={summaryProvider}
                    onChange={handleProviderChange}
                  />
                </SettingField>

                {getProviderConfig(summaryProvider)?.isCustom && (
                  <SettingField
                    label="Server URL"
                    hint="OpenAI-compatible chat completions endpoint"
                  >
                    <TextField
                      value={summaryBaseUrl}
                      onChange={(e) => handleBaseUrlChange(e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="http://localhost:8080/v1/chat/completions"
                    />
                  </SettingField>
                )}

                <SettingField label="API Key" hint={getProviderConfig(summaryProvider)?.apiKeyHint}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      fullWidth
                      size="small"
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter API key"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowApiKey(!showApiKey)}
                              edge="end"
                              size="small"
                              aria-label={showApiKey ? "Hide API key" : "Show API key"}
                            >
                              {showApiKey ? (
                                <VisibilityOff fontSize="small" />
                              ) : (
                                <Visibility fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleTestApiConnection}
                      disabled={
                        isTestingApi ||
                        ((getProviderConfig(summaryProvider)?.requiresApiKey ?? true)
                          ? !apiKey.trim()
                          : false)
                      }
                      sx={{ minWidth: 64, flexShrink: 0 }}
                    >
                      {isTestingApi ? <CircularProgress size={20} /> : "Test"}
                    </Button>
                  </Box>
                </SettingField>

                <SettingField label="Model">
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    {availableModels.length === 0 ? (
                      // No list fetched yet — let the user type a model id. The
                      // list loads once credentials are set, or via ↻.
                      <TextField
                        value={summaryModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="Model id"
                      />
                    ) : (
                      <FormControl fullWidth size="small" sx={{ minWidth: 0 }}>
                        <Select
                          value={
                            // Keep the current selection valid even if it isn't
                            // in the fetched list.
                            availableModels.some((m) => m.id === summaryModel) ? summaryModel : ""
                          }
                          displayEmpty
                          // Show just the id in the closed field; the estimate
                          // line is only for the open menu.
                          renderValue={(value) => value || "Select a model"}
                          onChange={(e) => handleModelChange(e.target.value)}
                        >
                          {availableModels.map((model) => (
                            <MuiMenuItem key={model.id} value={model.id}>
                              <ListItemText
                                primary={model.id}
                                secondary={
                                  model.estimate
                                    ? `~${model.estimate.summariesPerDay} summaries/day`
                                    : undefined
                                }
                                sx={{
                                  my: 0,
                                  "& .MuiListItemText-primary": {
                                    wordBreak: "break-all",
                                  },
                                }}
                              />
                            </MuiMenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                    <IconButton
                      onClick={handleRefreshModels}
                      disabled={isFetchingModels}
                      title="Fetch available models from provider"
                      aria-label="Fetch available models from provider"
                      size="small"
                    >
                      {isFetchingModels ? (
                        <CircularProgress size={20} />
                      ) : (
                        <RefreshIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Box>
                </SettingField>

                <SettingField
                  label="Detail level"
                  hint={DETAIL_LEVELS[summarySettings.detailLevel]}
                >
                  <Box sx={{ px: 1 }}>
                    <Slider
                      value={summarySettings.detailLevel}
                      onChange={(_, value) =>
                        handleSettingChange("detailLevel", value as DetailLevel)
                      }
                      min={0}
                      max={4}
                      step={1}
                      marks
                      size="small"
                      aria-label="Detail level"
                    />
                  </Box>
                  {/* End labels sit outside the slider so they can't overflow narrow screens. */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: -1,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {DETAIL_LEVELS[0]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {DETAIL_LEVELS[DETAIL_LEVELS.length - 1]}
                    </Typography>
                  </Box>
                </SettingField>

                <SettingField label="Format">
                  <ChipGroup
                    options={FORMAT_OPTIONS}
                    value={summarySettings.format}
                    onChange={(v) => handleSettingChange("format", v)}
                    size="small"
                  />
                </SettingField>

                <SettingField label="Tone">
                  <ChipGroup
                    options={TONE_OPTIONS}
                    value={summarySettings.tone}
                    onChange={(v) => handleSettingChange("tone", v)}
                    size="small"
                  />
                </SettingField>

                <SettingField label="Focus">
                  <ChipGroup
                    options={FOCUS_OPTIONS}
                    value={summarySettings.focus}
                    onChange={(v) => handleSettingChange("focus", v)}
                    size="small"
                  />
                </SettingField>

                <SettingField
                  label="Custom prompt (advanced)"
                  hint="Replaces the settings above. Use {text} for the article text."
                >
                  <TextField
                    value={summarySettings.customPrompt}
                    onChange={(e) => handleSettingChange("customPrompt", e.target.value)}
                    fullWidth
                    size="small"
                    multiline
                    minRows={2}
                    placeholder="Leave empty to use the settings above"
                  />
                </SettingField>
              </>
            )}
          </List>

          {/* About Section */}
          <List>
            <ListSubheader>Catalog Info</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <ArticleIcon />
              </ListItemIcon>
              <ListItemText
                primary="Unread Articles"
                secondary={
                  unreadCount !== undefined && unreadWordCountSum !== undefined ? (
                    <>
                      {unreadCount} articles
                      <br />
                      Reading time: {formatReadTime(Math.ceil(unreadWordCountSum / readingWpm))}
                    </>
                  ) : (
                    "Loading..."
                  )
                }
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <ArchiveIcon />
              </ListItemIcon>
              <ListItemText
                primary="Archived Articles"
                secondary={
                  archivedCount !== undefined && archivedWordCountSum !== undefined ? (
                    <>
                      {archivedCount} articles
                      <br />
                      Reading time: {formatReadTime(Math.ceil(archivedWordCountSum / readingWpm))}
                    </>
                  ) : (
                    "Loading..."
                  )
                }
              />
            </ListItem>

            <ListItem
              secondaryAction={
                readingSpeedSampleCount > 0 ? (
                  <Button size="small" onClick={() => resetReadingSpeed()}>
                    Reset
                  </Button>
                ) : undefined
              }
            >
              <ListItemIcon>
                <SpeedIcon />
              </ListItemIcon>
              <ListItemText
                primary="Reading speed"
                secondary={
                  readingSpeedSampleCount > 0 ? (
                    <>
                      {Math.round(readingWpm)} words/min
                      <br />
                      Learned from {readingSpeedSampleCount} reading
                      {readingSpeedSampleCount === 1 ? " session" : " sessions"}
                    </>
                  ) : (
                    `${DEFAULT_WPM} words/min (default — read some articles to personalize)`
                  )
                }
              />
            </ListItem>

            <ListItem onClick={() => navigate({ to: "/diagnostics" })} sx={{ cursor: "pointer" }}>
              <ListItemIcon>
                <StorageIcon />
              </ListItemIcon>
              <ListItemText
                primary="Catalog size"
                secondary={
                  storageUsage
                    ? `${formatBytes(storageUsage.size)} (${storageUsage.articles} articles, ${storageUsage.files} files)`
                    : "Calculating..."
                }
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <ArchiveIcon />
              </ListItemIcon>
              <ListItemText primary="Export catalog" secondary="Download all article metadata" />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    try {
                      const articles = await db.articles.toArray();
                      const dataStr = JSON.stringify(articles, null, 2);
                      const dataBlob = new Blob([dataStr], { type: "application/json" });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `savr-articles-${new Date().toISOString().split("T")[0]}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                      enqueueSnackbar("JSON export completed!", { variant: "success" });
                    } catch (error) {
                      console.error("Export failed:", error);
                      enqueueSnackbar("Export failed", { variant: "error" });
                    }
                  }}
                >
                  JSON
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={async () => {
                    try {
                      const articles = await db.articles.toArray();
                      const csvContent = [
                        [
                          "Title",
                          "URL",
                          "State",
                          "Read Time (min)",
                          "Publication",
                          "Author",
                          "Published Date",
                          "Ingest Date",
                          "Ingest Platform",
                          "Ingest Source",
                          "MIME Type",
                          "Progress",
                        ],
                        ...articles.map((article) => [
                          article.title || "",
                          article.url || "",
                          article.state || "",
                          article.wordCount || "",
                          article.publication || "",
                          article.author || "",
                          article.publishedDate || "",
                          article.ingestDate || "",
                          article.ingestPlatform || "",
                          article.ingestSource || "",
                          article.mimeType || "",
                          article.progress || "",
                        ]),
                      ]
                        .map((row) => row.map((field) => `"${field}"`).join(","))
                        .join("\n");

                      const dataBlob = new Blob([csvContent], { type: "text/csv" });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `savr-articles-${new Date().toISOString().split("T")[0]}.csv`;
                      link.click();
                      URL.revokeObjectURL(url);
                      enqueueSnackbar("CSV export completed!", { variant: "success" });
                    } catch (error) {
                      console.error("Export failed:", error);
                      enqueueSnackbar("Export failed", { variant: "error" });
                    }
                  }}
                >
                  CSV
                </Button>
              </Box>
            </ListItem>
          </List>

          {/* Privacy Section — only shown on builds where telemetry is configured */}
          {isTelemetryConfigured() && (
            <List>
              <ListSubheader>Privacy</ListSubheader>

              <ListItem>
                <ListItemIcon>
                  <InsightsIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Share anonymous usage statistics"
                  secondary={
                    gpcActive
                      ? "Disabled by your browser's Global Privacy Control signal. Savr honors that, so this setting is ignored while it's on."
                      : telemetryEnabled
                        ? "Sends anonymous counts (app opens, captures, installs) and your country. No account, no article URLs or content. Respects Global Privacy Control."
                        : "Off — no usage data is collected."
                  }
                />
                <Switch
                  edge="end"
                  checked={gpcActive ? false : telemetryEnabled}
                  disabled={gpcActive}
                  onChange={handleTelemetryToggle}
                />
              </ListItem>
            </List>
          )}

          {/* Public Export Section */}
          <List>
            <ListSubheader>Public Export</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <PublicIcon />
              </ListItemIcon>
              <ListItemText
                primary="Publish public database export"
                secondary="Publishes a public read-only copy of your Savr database JSON through your RemoteStorage provider. This file may include deleted records if they exist in your database."
              />
              <Switch
                checked={publicExportState.enabled}
                onChange={async (e) => {
                  if (e.target.checked) {
                    try {
                      await enablePublicExport();
                      enqueueSnackbar("Public export enabled", { variant: "success" });
                    } catch {
                      enqueueSnackbar("Failed to publish export", { variant: "error" });
                    }
                  } else {
                    const result = await disablePublicExport();
                    if (result.success) {
                      enqueueSnackbar("Public export disabled");
                    } else {
                      enqueueSnackbar(
                        `Export disabled but failed to delete remote file: ${result.error}`,
                        {
                          variant: "warning",
                        },
                      );
                    }
                  }
                }}
              />
            </ListItem>

            {publicExportState.enabled && (
              <>
                <ListItem>
                  <ListItemText
                    primary="Public export is enabled"
                    secondary={
                      <>
                        {publicExportState.publicUrl ? (
                          <>
                            URL:{" "}
                            <span style={{ wordBreak: "break-all" }}>
                              {publicExportState.publicUrl}
                            </span>
                            <br />
                          </>
                        ) : publicExportState.lastPublishedAt ? (
                          <>
                            URL: not available for this provider
                            <br />
                          </>
                        ) : (
                          <>
                            URL: pending first publish…
                            <br />
                          </>
                        )}
                        Status:{" "}
                        {publicExportState.publishing
                          ? "Publishing…"
                          : publicExportState.lastError
                            ? "Failed"
                            : publicExportState.dirty
                              ? "Pending changes"
                              : "Up to date"}
                        {publicExportState.lastPublishedAt && (
                          <>
                            <br />
                            Last published:{" "}
                            {new Date(publicExportState.lastPublishedAt).toLocaleString()}
                          </>
                        )}
                        {publicExportState.lastError && (
                          <>
                            <br />
                            Error: {publicExportState.lastError}
                          </>
                        )}
                      </>
                    }
                  />
                </ListItem>
                <ListItem>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={publicExportState.publishing}
                    onClick={async () => {
                      try {
                        await publishNow();
                        enqueueSnackbar("Published successfully", { variant: "success" });
                      } catch {
                        enqueueSnackbar("Publish failed", { variant: "error" });
                      }
                    }}
                  >
                    Publish now
                  </Button>
                </ListItem>
              </>
            )}
          </List>

          <List>
            <ListSubheader>Savr</ListSubheader>

            <ListItem>
              {/* <ListItemIcon>
                <DeleteIcon />
              </ListItemIcon> */}
              <ListItemText primary="Version" secondary={version} />
            </ListItem>
            <ListItem>
              <ListItemText primary="Deployed" secondary={buildDate} />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Source code"
                secondary={
                  <a href="https://github.com/jonocodes/savr" target="_blank">
                    github.com/jonocodes/savr
                  </a>
                }
              />
            </ListItem>
          </List>

          {/* Danger Zone Section */}
          <List sx={{ mb: 10 }}>
            <ListSubheader sx={{ color: "error.main" }}>Danger Zone</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <DeleteIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Delete All Articles"
                secondary={
                  rsConnected
                    ? "Disconnect from remote storage first to delete all articles"
                    : "Permanently remove all articles from the database"
                }
              />
              <Tooltip title={rsConnected ? "Disconnect from remote storage first" : ""}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={totalArticleCount === 0 || rsConnected}
                    sx={{ mb: 2 }}
                    data-testid="delete-all-articles-button"
                  >
                    Delete All
                  </Button>
                </span>
              </Tooltip>
            </ListItem>
          </List>
        </Paper>
      </Container>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        data-testid="delete-all-articles-dialog"
      >
        <DialogTitle id="delete-dialog-title">Delete All Articles</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete all {totalArticleCount} articles? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteAllArticles}
            color="error"
            variant="contained"
            data-testid="confirm-delete-all-button"
          >
            Delete All Articles
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
