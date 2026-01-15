import React, { useEffect, useState } from "react";
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
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  BookmarkAdd as BookmarkAddIcon,
  Web as WebIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
  Info as InfoIcon,
  Article as ArticleIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Help as HelpIcon,
  Storage as StorageIcon,
  Sync as SyncIcon,
  CalendarToday as CalendarTodayIcon,
  TextFields as TextFieldsIcon,
  DragHandle as DragHandleIcon,
  Wifi as WifiIcon,
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
  getWiFiOnlySyncFromCookie,
  setWiFiOnlySyncInCookie,
  AFTER_EXTERNAL_SAVE_ACTIONS,
  AfterExternalSaveAction,
} from "~/utils/cookies";
import { isPWAMode, isNetworkInfoSupported } from "~/utils/network";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import { calculateStorageUsage, deleteAllRemoteStorage, formatBytes } from "~/utils/storage";
import { version } from "../../package.json" with { type: "json" };
import { BUILD_TIMESTAMP } from "~/config/environment";
import { SYNC_ENABLED_COOKIE_NAME } from "~/utils/cookies";

export default function PreferencesScreen() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());
  const [corsProxy, setCorsProxy] = React.useState<string>("");
  const [isCustomCorsProxy, setIsCustomCorsProxy] = React.useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState<boolean>(true);
  const [wifiOnlySync, setWifiOnlySync] = React.useState<boolean>(false);
  const [headerHidingEnabled, setHeaderHidingEnabled] = React.useState<boolean>(false);
  const [afterExternalSave, setAfterExternalSave] = React.useState<AfterExternalSaveAction>(
    AFTER_EXTERNAL_SAVE_ACTIONS.CLOSE_TAB
  );
  const networkSupported = isNetworkInfoSupported();
  const [storageUsage, setStorageUsage] = useState<{
    size: number;
    files: number;
  } | null>(null);

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

    // Load WiFi-only sync setting from cookies
    setWifiOnlySync(getWiFiOnlySyncFromCookie());

    // Load header hiding setting from cookies
    setHeaderHidingEnabled(getHeaderHidingFromCookie());

    // Load after external save setting from cookies
    setAfterExternalSave(getAfterExternalSaveFromCookie());

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

  const handleWiFiOnlySyncToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setWifiOnlySync(newValue);
    setWiFiOnlySyncInCookie(newValue);
  };

  const handleHeaderHidingToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.checked;
    setHeaderHidingEnabled(newValue);
    setHeaderHidingInCookie(newValue);
  };

  const handleAfterExternalSaveChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value as AfterExternalSaveAction;
    setAfterExternalSave(newValue);
    setAfterExternalSaveInCookie(newValue);
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

            {syncEnabled && networkSupported && (
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
                  unreadCount !== undefined && unreadReadTimeSum !== undefined
                    ? `${unreadCount} articles (total estimated reading time: ${unreadReadTimeSum} min)`
                    : "Loading..."
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
                  archivedCount !== undefined && archivedReadTimeSum !== undefined
                    ? `${archivedCount} articles (total estimated reading time: ${archivedReadTimeSum} min)`
                    : "Loading..."
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
              <ListItemText primary="Mode" secondary={isInstalledPWA ? "PWA" : "Web app"} />
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
