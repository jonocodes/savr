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
  ScreenRotation as ScreenRotationIcon,
} from "@mui/icons-material";
import { setCorsProxyValue } from "~/utils/tools";
import { getDefaultCorsProxy } from "~/config/environment";
import { getCorsProxyFromCookie } from "~/utils/cookies";
import {
  getThemeFromCookie,
  toggleTheme,
  useSystemThemeListener,
  getEffectiveTheme,
  getHeaderHidingFromCookie,
  setHeaderHidingInCookie,
  getAfterExternalSaveFromCookie,
  setAfterExternalSaveInCookie,
  getSummarizationEnabledFromCookie,
  setSummarizationEnabledInCookie,
  getSummaryProviderFromCookie,
  setSummaryProviderInCookie,
  getSummaryModelFromCookie,
  setSummaryModelInCookie,
  getApiKeyForProvider,
  setApiKeyForProvider,
  getSummarySettingsFromCookie,
  setSummarySettingsInCookie,
  getRotationLockFromCookie,
  setRotationLockInCookie,
  // getWiFiOnlySyncFromCookie, // Disabled - feature not working correctly
  // setWiFiOnlySyncInCookie, // Disabled - feature not working correctly
  AFTER_EXTERNAL_SAVE_ACTIONS,
  AfterExternalSaveAction,
  RotationLockMode,
} from "~/utils/cookies";
import {
  PROVIDERS,
  DETAIL_LEVELS,
  TONE_OPTIONS,
  FOCUS_OPTIONS,
  FORMAT_OPTIONS,
  DEFAULT_SUMMARY_SETTINGS,
  testApiConnection,
  type SummaryProvider,
  type DetailLevel,
} from "~/utils/summarization";
import { isPWAMode, isNetworkInfoSupported } from "~/utils/network";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import { calculateStorageUsage, deleteAllRemoteStorage, formatBytes } from "~/utils/storage";
import { version } from "../../package.json" with { type: "json" };
import { BUILD_TIMESTAMP } from "~/config/environment";
import { SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies";

/**
 * Formats minutes as a human-readable time string.
 * Examples:
 *   - 22 min -> "22 min"
 *   - 683 min -> "11:23"
 *   - 1500 min -> "1 day 1:00"
 *   - 3000 min -> "2 days 2:00"
 */
export function formatReadTime(minutes: number): string {
  const totalHours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  // Under 1 hour: show just minutes
  if (totalHours === 0) {
    return `${mins} min`;
  }

  // 24+ hours: show days and hours:minutes
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const dayLabel = days === 1 ? "day" : "days";
    return `${days} ${dayLabel} ${hours}:${mins.toString().padStart(2, "0")}`;
  }

  // 1-24 hours: show hours:minutes
  return `${totalHours}:${mins.toString().padStart(2, "0")}`;
}

export default function PreferencesScreen() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());
  const [corsProxy, setCorsProxy] = React.useState<string>("");
  const [isCustomCorsProxy, setIsCustomCorsProxy] = React.useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState<boolean>(true);
  // const [wifiOnlySync, setWifiOnlySync] = React.useState<boolean>(false); // Disabled - feature not working correctly
  const [headerHidingEnabled, setHeaderHidingEnabled] = React.useState<boolean>(false);
  const [rotationLock, setRotationLock] = React.useState<RotationLockMode>("off");
  const [afterExternalSave, setAfterExternalSave] = React.useState<AfterExternalSaveAction>(
    AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB
  );
  const _networkSupported = isNetworkInfoSupported();
  const [storageUsage, setStorageUsage] = useState<{
    size: number;
    files: number;
  } | null>(null);
  const [summarizationEnabled, setSummarizationEnabled] = useState<boolean>(false);
  const [summaryProvider, setSummaryProvider] = useState<SummaryProvider>("groq");
  const [summaryModel, setSummaryModel] = useState<string>("llama-3.3-70b-versatile");
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [summarySettings, setSummarySettings] = useState(DEFAULT_SUMMARY_SETTINGS);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bookmarklet, setBookmarklet] = React.useState<string>("");
  const bookmarkletRef = React.useRef<HTMLAnchorElement>(null);

  // Check if running as installed PWA
  const isInstalledPWA = isPWAMode();

  const { client: storageClient } = useRemoteStorage();
  const { enqueueSnackbar } = useSnackbar();

  const buildDate =
    new Date(BUILD_TIMESTAMP).toDateString() + " " + new Date(BUILD_TIMESTAMP).toLocaleTimeString();

  React.useEffect(() => {
    const customValue = getCorsProxyFromCookie();
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

    // Load WiFi-only sync setting from cookies - DISABLED
    // setWifiOnlySync(getWiFiOnlySyncFromCookie());

    // Load header hiding setting from cookies
    setHeaderHidingEnabled(getHeaderHidingFromCookie());

    // Load rotation lock setting from cookies
    setRotationLock(getRotationLockFromCookie());

    // Load after external save setting from cookies
    setAfterExternalSave(getAfterExternalSaveFromCookie());

    // Load summarization settings from cookies
    setSummarizationEnabled(getSummarizationEnabledFromCookie());
    const savedProvider = getSummaryProviderFromCookie() as SummaryProvider;
    setSummaryProvider(savedProvider);
    setSummaryModel(getSummaryModelFromCookie());
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
      `data:text/html,<html><body><script>var url=encodeURIComponent(window.location.href);window.open('${saveRoute}?saveUrl='+url,'_blank');</script></body></html>`
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
  }, []);
  const navigate = useNavigate();

  // Article count queries
  const unreadCount = useLiveQuery(() => db.articles.where("state").equals("unread").count());
  const archivedCount = useLiveQuery(() => db.articles.where("state").equals("archived").count());

  // Read time sum queries
  const unreadReadTimeSum = useLiveQuery(async () => {
    const unreadArticles = await db.articles.where("state").equals("unread").toArray();
    return unreadArticles.reduce((sum, article) => sum + (article.readTimeMinutes || 0), 0);
  });
  const archivedReadTimeSum = useLiveQuery(async () => {
    const archivedArticles = await db.articles.where("state").equals("archived").toArray();
    return archivedArticles.reduce((sum, article) => sum + (article.readTimeMinutes || 0), 0);
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

      if (storageClient) {
        await deleteAllRemoteStorage();
      }

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

  const handleSyncToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setSyncEnabled(newValue);
    // Save to cookies
    document.cookie = `${SYNC_ENABLED_COOKIE_NAME}=${newValue}; path=/; max-age=31536000`; // 1 year expiry

    // Only refresh when enabling sync to properly initialize the widget
    if (newValue) {
      window.location.reload();
    }
  };

  // DISABLED - WiFi-only sync feature not working correctly
  // const handleWiFiOnlySyncToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
  //   const newValue = event.target.checked;
  //   setWifiOnlySync(newValue);
  //   setWiFiOnlySyncInCookie(newValue);
  // };

  const handleHeaderHidingToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHeaderHidingEnabled(newValue);
    setHeaderHidingInCookie(newValue);
  };

  const handleRotationLockChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value as RotationLockMode;
    setRotationLock(newValue);
    setRotationLockInCookie(newValue);
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
      enqueueSnackbar("AI summarization enabled");
    } else {
      enqueueSnackbar("AI summarization disabled");
    }
  };

  const handleProviderChange = (provider: SummaryProvider) => {
    setSummaryProvider(provider);
    setSummaryProviderInCookie(provider);
    // Set default model for provider
    const providerConfig = PROVIDERS.find((p) => p.id === provider);
    if (providerConfig && providerConfig.models.length > 0) {
      const defaultModel = providerConfig.models[0].id;
      setSummaryModel(defaultModel);
      setSummaryModelInCookie(defaultModel);
    }
    // Load API key for this provider
    const savedKey = getApiKeyForProvider(provider);
    setApiKey(savedKey || "");
  };

  const handleModelChange = (model: string) => {
    setSummaryModel(model);
    setSummaryModelInCookie(model);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    setApiKeyForProvider(summaryProvider, key || null);
  };

  const handleTestApiConnection = async () => {
    if (!apiKey.trim()) {
      enqueueSnackbar("Please enter an API key first", { variant: "warning" });
      return;
    }
    setIsTestingApi(true);
    try {
      const result = await testApiConnection(summaryProvider, apiKey, summaryModel);
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
    value: (typeof summarySettings)[K]
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

            {!isInstalledPWA && (
              <ListItem>
                <ListItemIcon>
                  <BookmarkAddIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Bookmarklet"
                  secondary="Drag this link to your bookmarks bar"
                />
                <Box sx={{ ml: 2 }}>
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

            <ListItem>
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
                // placeholder="https://"
                // size="small"
                sx={{
                  width: "50%",
                  "& .MuiInputBase-input": {
                    color: isCustomCorsProxy ? "text.primary" : "text.disabled",
                  },
                }}
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <BookmarkAddIcon />
              </ListItemIcon>
              <ListItemText
                primary="After external save"
                secondary="What to do after saving an article from a bookmarklet"
              />
              <select
                value={afterExternalSave}
                onChange={handleAfterExternalSaveChange}
                style={{
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
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
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <SyncIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Enable synchronization (experimental)
                    <Tooltip title="Allows you to sync your articles across devices using a cloud service">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
              />
              <Switch edge="end" checked={syncEnabled} onChange={handleSyncToggle} />
            </ListItem>

            {/* DISABLED - WiFi-only sync feature not working correctly */}
            {/* {syncEnabled && networkSupported && (
              <ListItem>
                <ListItemIcon>
                  <WifiIcon />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      Sync only over WiFi
                      <Tooltip title="When enabled, sync will only happen when connected to WiFi. Works on mobile browsers that support network detection.">
                        <HelpIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Box>
                  }
                  secondary="Pause sync when on cellular data"
                />
                <Switch edge="end" checked={wifiOnlySync} onChange={handleWiFiOnlySyncToggle} />
              </ListItem>
            )} */}
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

            <ListItem>
              <ListItemIcon>
                <ScreenRotationIcon />
              </ListItemIcon>
              <ListItemText
                primary="Lock screen rotation"
                secondary={
                  isInstalledPWA
                    ? "Prevent screen rotation while reading articles"
                    : "Requires app to be installed as PWA (Add to Home Screen)"
                }
              />
              <select
                value={rotationLock}
                onChange={handleRotationLockChange}
                disabled={!isInstalledPWA}
                style={{
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "14px",
                  minWidth: "120px",
                  opacity: isInstalledPWA ? 1 : 0.5,
                }}
              >
                <option value="off">Off</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </ListItem>
          </List>

          {/* AI Summarization Section */}
          <List>
            <ListSubheader>AI Summarization</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <AutoAwesomeIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Enable AI Summarization
                    <Tooltip title="Generate summaries when saving articles using cloud AI providers (Groq or OpenAI).">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
                secondary={summarizationEnabled ? "Summaries will be generated for new articles" : "Summaries are disabled"}
              />
              <Switch
                edge="end"
                checked={summarizationEnabled}
                onChange={handleSummarizationToggle}
              />
            </ListItem>

            {summarizationEnabled && (
              <>
                {/* Provider Selection */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText primary="Provider" secondary="Choose your AI provider" />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, ml: 7 }}>
                    {PROVIDERS.map((provider) => (
                      <Chip
                        key={provider.id}
                        label={provider.name}
                        onClick={() => handleProviderChange(provider.id)}
                        variant={summaryProvider === provider.id ? "filled" : "outlined"}
                        color={summaryProvider === provider.id ? "primary" : "default"}
                      />
                    ))}
                  </Box>
                </ListItem>

                {/* Model Selection */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText primary="Model" />
                  </Box>
                  <Box sx={{ ml: 7, pr: 2, width: "calc(100% - 56px)" }}>
                    <FormControl fullWidth size="small">
                      <Select
                        value={summaryModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                      >
                        {PROVIDERS.find((p) => p.id === summaryProvider)?.models.map((model) => (
                          <MuiMenuItem key={model.id} value={model.id}>
                            {model.name} - {model.description}
                          </MuiMenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </ListItem>

                {/* API Key */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="API Key"
                      secondary={
                        summaryProvider === "groq"
                          ? "Get a free key at console.groq.com"
                          : "Get a key at platform.openai.com"
                      }
                    />
                  </Box>
                  <Box sx={{ ml: 7, pr: 2, display: "flex", gap: 1, width: "calc(100% - 56px)" }}>
                    <TextField
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      fullWidth
                      size="small"
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter API key..."
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowApiKey(!showApiKey)}
                              edge="end"
                              size="small"
                            >
                              {showApiKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleTestApiConnection}
                      disabled={isTestingApi || !apiKey.trim()}
                      sx={{ minWidth: 80 }}
                    >
                      {isTestingApi ? <CircularProgress size={20} /> : "Test"}
                    </Button>
                  </Box>
                </ListItem>

                {/* Detail Level */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Detail Level"
                      secondary={DETAIL_LEVELS[summarySettings.detailLevel]}
                    />
                  </Box>
                  <Box sx={{ ml: 7, mr: 2, width: "calc(100% - 56px)" }}>
                    <Slider
                      value={summarySettings.detailLevel}
                      onChange={(_, value) => handleSettingChange("detailLevel", value as DetailLevel)}
                      min={0}
                      max={4}
                      marks={DETAIL_LEVELS.map((label, i) => ({ value: i, label: i === 0 || i === 4 ? label : "" }))}
                      size="small"
                    />
                  </Box>
                </ListItem>

                {/* Format */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText primary="Format" />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, ml: 7 }}>
                    {FORMAT_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        onClick={() => handleSettingChange("format", option.value)}
                        variant={summarySettings.format === option.value ? "filled" : "outlined"}
                        color={summarySettings.format === option.value ? "primary" : "default"}
                        size="small"
                      />
                    ))}
                  </Box>
                </ListItem>

                {/* Tone */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText primary="Tone" />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, ml: 7 }}>
                    {TONE_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        onClick={() => handleSettingChange("tone", option.value)}
                        variant={summarySettings.tone === option.value ? "filled" : "outlined"}
                        color={summarySettings.tone === option.value ? "primary" : "default"}
                        size="small"
                      />
                    ))}
                  </Box>
                </ListItem>

                {/* Focus */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText primary="Focus" />
                  </Box>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, ml: 7 }}>
                    {FOCUS_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        onClick={() => handleSettingChange("focus", option.value)}
                        variant={summarySettings.focus === option.value ? "filled" : "outlined"}
                        color={summarySettings.focus === option.value ? "primary" : "default"}
                        size="small"
                      />
                    ))}
                  </Box>
                </ListItem>

                {/* Custom Prompt */}
                <ListItem sx={{ flexDirection: "column", alignItems: "stretch" }}>
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%", mb: 1 }}>
                    <ListItemIcon>
                      <AutoAwesomeIcon sx={{ visibility: "hidden" }} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Custom Prompt (Advanced)"
                      secondary="Override with your own prompt. Use {text} for article text."
                    />
                  </Box>
                  <Box sx={{ ml: 7, pr: 2, width: "calc(100% - 56px)" }}>
                    <TextField
                      value={summarySettings.customPrompt}
                      onChange={(e) => handleSettingChange("customPrompt", e.target.value)}
                      fullWidth
                      size="small"
                      multiline
                      rows={2}
                      placeholder="Leave empty to use settings above..."
                    />
                  </Box>
                </ListItem>
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
                  unreadCount !== undefined && unreadReadTimeSum !== undefined ? (
                    <>
                      {unreadCount} articles
                      <br />
                      Reading time: {formatReadTime(unreadReadTimeSum)}
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
                  archivedCount !== undefined && archivedReadTimeSum !== undefined ? (
                    <>
                      {archivedCount} articles
                      <br />
                      Reading time: {formatReadTime(archivedReadTimeSum)}
                    </>
                  ) : (
                    "Loading..."
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
                    ? `${formatBytes(storageUsage.size)} (${storageUsage.files} files)`
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
                          article.readTimeMinutes || "",
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
                secondary="Permanently remove all articles from the database"
              />
              <Button
                variant="outlined"
                color="error"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={totalArticleCount === 0}
                sx={{ mb: 2 }}
              >
                Delete All
              </Button>
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
