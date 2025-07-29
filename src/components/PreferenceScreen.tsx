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
  Divider,
  Chip,
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
} from "@mui/icons-material";
import { setCorsProxyValue } from "~/utils/tools";
import { getDefaultCorsProxy } from "~/config/environment";
import { getCorsProxyFromCookie } from "~/utils/cookies";
import {
  getThemeFromCookie,
  toggleTheme,
  useSystemThemeListener,
  getEffectiveTheme,
} from "~/utils/cookies";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { useSnackbar } from "notistack";
import { calculateStorageUsage, deleteAllRemoteStorage, formatBytes } from "~/utils/storage";
import { version } from "../../package.json" with { type: "json" };

// Bookmarklet for development
// const bookmarklet =
//   "javascript:(function(){const app = 'http://localhost:8081'; var s = document.createElement('script'); s.src = app + '/bookmarklet-client.js'; document.body.appendChild(s); })();";

export default function PreferencesScreen() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());
  const [corsProxy, setCorsProxy] = React.useState<string>("");
  const [isCustomCorsProxy, setIsCustomCorsProxy] = React.useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState<boolean>(true);
  const [storageUsage, setStorageUsage] = React.useState<{
    size: number;
    files: number;
  } | null>(null);

  const [bookmarklet, setBookmarklet] = React.useState<string>("");
  const bookmarkletRef = React.useRef<HTMLAnchorElement>(null);

  // Check if running as installed PWA
  const isInstalledPWA = React.useMemo(() => {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://")
    );
  }, []);

  const { client: storageClient } = useRemoteStorage();
  const { enqueueSnackbar } = useSnackbar();

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
    const syncCookie = document.cookie.split("; ").find((row) => row.startsWith("syncEnabled="));
    if (syncCookie) {
      const syncValue = syncCookie.split("=")[1];
      setSyncEnabled(syncValue === "true");
    }

    const saveRoute = window.location.origin + "/";
    console.log("Absolute path to index for saving:", saveRoute);

    setBookmarklet(
      `data:text/html,<html><body><script>var url=encodeURIComponent(window.location.href);window.open('${saveRoute}?closeAfterSave=true&saveUrl='+url,'_blank');</script></body></html>`
    );
  }, []);

  // Set the javascript: URL directly on the DOM element
  React.useEffect(() => {
    if (bookmarkletRef.current) {
      const saveRoute = window.location.origin + "/";
      const bookmarkletJS = `javascript:(function(){var url=encodeURIComponent(window.location.href);window.open('${saveRoute}?closeAfterSave=true&saveUrl='+url,'_blank');})();`;
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
    document.cookie = `syncEnabled=${newValue}; path=/; max-age=31536000`; // 1 year expiry

    // Only refresh when enabling sync to properly initialize the widget
    if (newValue) {
      window.location.reload();
    }
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
                    draggable="true"
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
                    savr save
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
                    <Tooltip title="Todo: Explain CORS">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
                secondary="Proxy server for cross-origin requests"
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
                <SyncIcon />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    Enable syncronization
                    <Tooltip title="Allows you to sync your articles across devices using a cloud service">
                      <HelpIcon fontSize="small" color="action" />
                    </Tooltip>
                  </Box>
                }
              />
              <Switch edge="end" checked={syncEnabled} onChange={handleSyncToggle} />
            </ListItem>
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
          </List>

          {/* About Section */}
          <List>
            <ListSubheader>About</ListSubheader>

            <ListItem>
              <ListItemIcon>
                <InfoIcon />
              </ListItemIcon>
              <ListItemText primary="App Version" secondary={version} />
            </ListItem>

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

            <ListItem>
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
          </List>

          {/* Danger Zone Section */}
          <List>
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
          <Button onClick={handleDeleteAllArticles} color="error" variant="contained">
            Delete All Articles
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
