import {
  Box,
  Typography,
  Paper,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
} from "@mui/material";
import {
  CloudQueue as CloudQueueIcon,
  CloudOff as CloudOffIcon,
  Cloud as CloudIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "~/components/RemoteStorageProvider";
import { useSyncStatus } from "~/components/SyncStatusProvider";
import { useSyncProgress } from "~/hooks/useSyncProgress";
import { environmentConfig, BUILD_TIMESTAMP } from "~/config/environment";
import { isPWAMode } from "~/utils/network";
import React from "react";

interface RemoteStorageEvent {
  timestamp: string;
  event: string;
  data?: Record<string, unknown>;
}

export default function DiagnosticsScreen() {
  // Get all articles from the database
  const articles = useLiveQuery(() => db.articles.toArray());
  const { status: syncStatus, isWiFi, isNetworkSupported } = useSyncStatus();
  const syncProgress = useSyncProgress();
  const [danglingItems, setDanglingItems] = React.useState<
    Array<{
      path: string;
      type: "directory";
      details: Record<string, unknown>;
    }>
  >([]);
  const [isScanningDangling, setIsScanningDangling] = React.useState(false);
  const [orphanedArticles, setOrphanedArticles] = React.useState<
    Array<{
      article: { slug: string; title?: string; state: string; url?: string | null };
      reason: string;
    }>
  >([]);
  const [isScanningOrphaned, setIsScanningOrphaned] = React.useState(false);
  const [indexedDbStats, setIndexedDbStats] = React.useState<{
    totalCount: number;
    countsByState: Record<string, number>;
    oldestIngestDate: string | null;
    newestIngestDate: string | null;
  } | null>(null);
  const [remoteStorageEvents, setRemoteStorageEvents] = React.useState<RemoteStorageEvent[]>([]);
  const [remoteStorageState, setRemoteStorageState] = React.useState<{
    connected: boolean;
    userAddress: string | null;
    backend: string | null;
  }>({
    connected: false,
    userAddress: null,
    backend: null,
  });

  const { client: remoteStorageClient, remoteStorage, widget } = useRemoteStorage();

  // Scan for dangling remote storage items (directories without corresponding database entries)
  const scanDanglingItems = React.useCallback(async () => {
    if (!remoteStorageClient || !articles) return;

    setIsScanningDangling(true);
    setDanglingItems([]); // Clear previous results
    try {
      // Only list the saves/ directory - no need for recursive scanning
      const listing = await remoteStorageClient.getListing("saves/");

      // Build a set of article slugs from the database for quick lookup
      const articleSlugs = new Set(articles.map((article) => article.slug));

      const dangling: Array<{
        path: string;
        type: "directory";
        details: Record<string, unknown>;
      }> = [];

      for (const [name, _isFolder] of Object.entries(listing as Record<string, boolean>)) {
        if (name.endsWith("/")) {
          // This is a directory in saves/
          const slug = name.slice(0, -1); // Remove trailing slash

          // Only include if there's no corresponding article in the database
          if (!articleSlugs.has(slug)) {
            const dirPath = `saves/${name}`;
            dangling.push({
              path: dirPath,
              type: "directory",
              details: {
                message: "Directory in remote storage without corresponding database entry",
                slug: slug,
              },
            });
          }
        }
      }

      setDanglingItems(dangling);
    } catch (error) {
      console.error("Failed to scan directories:", error);
    } finally {
      setIsScanningDangling(false);
    }
  }, [remoteStorageClient, articles]);

  // Scan for articles in database that don't have corresponding remote storage directories
  const scanOrphanedArticles = React.useCallback(async () => {
    if (!remoteStorageClient || !articles) {
      return;
    }

    setIsScanningOrphaned(true);
    setOrphanedArticles([]); // Clear previous results
    try {
      // Only list the saves/ directory - no need for recursive scanning
      const listing = await remoteStorageClient.getListing("saves/");
      const existingDirs = new Set<string>();

      // Build set of existing directories
      for (const [name, _isFolder] of Object.entries(listing as Record<string, boolean>)) {
        if (name.endsWith("/")) {
          existingDirs.add(name.slice(0, -1)); // Remove trailing slash
        }
      }

      // Check each article
      const orphaned: Array<{
        article: { slug: string; title?: string; state: string; url?: string | null };
        reason: string;
      }> = [];

      for (const article of articles) {
        if (!existingDirs.has(article.slug)) {
          orphaned.push({
            article,
            reason: "Missing remote storage directory",
          });
        }
      }

      setOrphanedArticles(orphaned);
    } catch (error) {
      console.error("scanOrphanedArticles: Failed to scan orphaned articles:", error);
      setOrphanedArticles([]);
    } finally {
      setIsScanningOrphaned(false);
    }
  }, [remoteStorageClient, articles?.length]);

  React.useEffect(() => {
    if (remoteStorageClient && articles) {
      console.log("Diagnostics useEffect: Starting scans", {
        hasClient: !!remoteStorageClient,
        articlesCount: articles.length,
      });
      scanDanglingItems();
      scanOrphanedArticles();
    } else {
      console.log("Diagnostics useEffect: Missing requirements", {
        hasClient: !!remoteStorageClient,
        hasArticles: !!articles,
        articlesLength: articles?.length,
      });
    }
  }, [remoteStorageClient, articles?.length]);

  // Calculate IndexedDB diagnostics
  React.useEffect(() => {
    const calculateIndexedDbStats = async () => {
      try {
        const totalCount = await db.articles.count();
        const allArticles = await db.articles.toArray();

        // Count by state
        const countsByState: Record<string, number> = {};
        for (const article of allArticles) {
          countsByState[article.state] = (countsByState[article.state] || 0) + 1;
        }

        // Find oldest and newest ingest dates
        const ingestDates = allArticles
          .map((a) => a.ingestDate)
          .filter((d): d is string => !!d)
          .sort();
        const oldestIngestDate = ingestDates.length > 0 ? ingestDates[0] : null;
        const newestIngestDate =
          ingestDates.length > 0 ? ingestDates[ingestDates.length - 1] : null;

        setIndexedDbStats({
          totalCount,
          countsByState,
          oldestIngestDate,
          newestIngestDate,
        });
      } catch (error) {
        console.error("Failed to calculate IndexedDB stats:", error);
        setIndexedDbStats(null);
      }
    };

    if (articles) {
      calculateIndexedDbStats();
    }
  }, [articles?.length]);

  // Set up RemoteStorage event listeners
  React.useEffect(() => {
    if (!remoteStorage) return;

    const addEvent = (event: string, data?: Record<string, unknown>) => {
      setRemoteStorageEvents((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          event,
          data,
        },
        ...prev.slice(0, 49), // Keep last 50 events
      ]);
    };

    const handleReady = () => {
      addEvent("ready");
    };

    const handleConnected = () => {
      addEvent("connected", {
        userAddress: remoteStorage.remote?.userAddress,
        backend: (remoteStorage.remote as { backend?: string })?.backend,
      });
      setRemoteStorageState({
        connected: true,
        userAddress: remoteStorage.remote?.userAddress || null,
        backend: (remoteStorage.remote as { backend?: string })?.backend || null,
      });
    };

    const handleDisconnected = () => {
      addEvent("disconnected");
      setRemoteStorageState({
        connected: false,
        userAddress: null,
        backend: null,
      });
    };

    const handleNotConnected = () => {
      addEvent("not-connected");
    };

    const handleSyncDone = () => {
      addEvent("sync-done");
    };

    const handleSyncReqDone = () => {
      addEvent("sync-req-done");
    };

    const handleNetworkOnline = () => {
      addEvent("network-online");
    };

    const handleNetworkOffline = () => {
      addEvent("network-offline");
    };

    const handleWireError = (event: unknown) => {
      const error = event as Error | { message?: string };
      addEvent("wire-error", { error: error?.message || String(error) });
    };

    const handleWireBusy = (event: unknown) => {
      const req = event as { path?: string };
      addEvent("wire-busy", { path: req?.path });
    };

    const handleWireDone = (event: unknown) => {
      const req = event as { path?: string };
      addEvent("wire-done", { path: req?.path });
    };

    // Register all event listeners
    remoteStorage.on("ready", handleReady);
    remoteStorage.on("connected", handleConnected);
    remoteStorage.on("disconnected", handleDisconnected);
    remoteStorage.on("not-connected", handleNotConnected);
    remoteStorage.on("sync-done", handleSyncDone);
    remoteStorage.on("sync-req-done", handleSyncReqDone);
    remoteStorage.on("network-online", handleNetworkOnline);
    remoteStorage.on("network-offline", handleNetworkOffline);
    remoteStorage.on("error", handleWireError);
    remoteStorage.on("wire-busy", handleWireBusy);
    remoteStorage.on("wire-done", handleWireDone);

    // Initialize state if already connected
    if (remoteStorage.remote?.connected) {
      setRemoteStorageState({
        connected: true,
        userAddress: remoteStorage.remote.userAddress || null,
        backend: (remoteStorage.remote as { backend?: string }).backend || null,
      });
    }

    // Cleanup
    return () => {
      remoteStorage.removeEventListener("ready", handleReady);
      remoteStorage.removeEventListener("connected", handleConnected);
      remoteStorage.removeEventListener("disconnected", handleDisconnected);
      remoteStorage.removeEventListener("not-connected", handleNotConnected);
      remoteStorage.removeEventListener("sync-done", handleSyncDone);
      remoteStorage.removeEventListener("sync-req-done", handleSyncReqDone);
      remoteStorage.removeEventListener("network-online", handleNetworkOnline);
      remoteStorage.removeEventListener("network-offline", handleNetworkOffline);
      remoteStorage.removeEventListener("error", handleWireError);
      remoteStorage.removeEventListener("wire-busy", handleWireBusy);
      remoteStorage.removeEventListener("wire-done", handleWireDone);
    };
  }, [remoteStorage]);

  // Show RemoteStorage widget on diagnostics page
  React.useEffect(() => {
    if (widget) {
      widget.attach("remotestorage-container");
    }
    return () => {
      if (widget) {
        widget.attach("remotestorage-container"); // Keep it attached even when leaving page
      }
    };
  }, [widget]);

  if (!articles) {
    return (
      <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", pt: 4 }}>
        <Container maxWidth="lg">
          <Paper elevation={2} sx={{ p: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Diagnostics
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Loading articles...
            </Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", pt: 4 }}>
      <Container maxWidth="lg">
        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Diagnostics
          </Typography>

          {/* RemoteStorage Status Section */}
          <Box sx={{ mt: 2, mb: 4 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              RemoteStorage Status
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Connection Status */}
              <Alert
                severity={remoteStorageState.connected ? "success" : "warning"}
                sx={{ display: "flex", alignItems: "center" }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                    {remoteStorageState.connected ? "Connected" : "Not Connected"}
                  </Typography>
                  {remoteStorageState.connected && (
                    <>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        User: {remoteStorageState.userAddress || "Unknown"}
                      </Typography>
                      <Typography variant="body2">
                        Backend: {remoteStorageState.backend || "Unknown"}
                      </Typography>
                    </>
                  )}
                </Box>
              </Alert>

              {/* Sync Progress */}
              <Alert severity={syncProgress.isSyncing ? "info" : "success"}>
                <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                  {syncProgress.isSyncing ? "Sync in Progress" : "Last Sync Status"}
                </Typography>
                <Typography variant="body2">Phase: {syncProgress.phase}</Typography>
                <Typography variant="body2">
                  Progress: {syncProgress.processedArticles} / {syncProgress.totalArticles}{" "}
                  {syncProgress.totalArticles === 0 ? "(preparing...)" : "articles"}
                </Typography>
                {syncProgress.processedArticles < syncProgress.totalArticles &&
                  !syncProgress.isSyncing && (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        onClick={async () => {
                          const { syncMissingArticles } = await import("~/utils/storage");
                          const result = await syncMissingArticles();
                          alert(result);
                        }}
                      >
                        Manually Sync Missing Articles
                      </Button>
                    </Box>
                  )}
              </Alert>

              {/* Recent Events */}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
                    RemoteStorage Events (Last 50)
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={() => setRemoteStorageEvents([])}
                  >
                    Clear
                  </Button>
                </Box>
                <Box
                  sx={{
                    maxHeight: 300,
                    overflowY: "auto",
                    backgroundColor: "grey.50",
                    borderRadius: 1,
                    p: 1,
                  }}
                >
                  {remoteStorageEvents.length > 0 ? (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold", width: "100px" }}>Time</TableCell>
                          <TableCell sx={{ fontWeight: "bold", width: "150px" }}>Event</TableCell>
                          <TableCell sx={{ fontWeight: "bold" }}>Data</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {remoteStorageEvents.map((event, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                              {event.timestamp}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={event.event}
                                size="small"
                                color={
                                  event.event === "connected" || event.event === "sync-done"
                                    ? "success"
                                    : event.event.includes("error") ||
                                        event.event === "disconnected"
                                      ? "error"
                                      : "default"
                                }
                              />
                            </TableCell>
                            <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                              {event.data ? JSON.stringify(event.data) : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ textAlign: "center", py: 2 }}
                    >
                      No events yet. Events will appear here as RemoteStorage operations occur.
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Box>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Page & Session Information
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Current page details and all stored cookies
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {JSON.stringify(
                {
                  pageInfo: {
                    absoluteUrl: window.location.href,
                    protocol: window.location.protocol,
                    host: window.location.host,
                    pathname: window.location.pathname,
                    search: window.location.search,
                    hash: window.location.hash,
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    cookieEnabled: navigator.cookieEnabled,
                    isPWA: (() => {
                      return (
                        window.matchMedia("(display-mode: standalone)").matches ||
                        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
                        document.referrer.includes("android-app://")
                      );
                    })(),
                  },
                  cookies: (() => {
                    const cookies: Record<string, string> = {};
                    document.cookie.split(";").forEach((cookie) => {
                      const [name, value] = cookie.trim().split("=");
                      if (name && value) {
                        cookies[name] = decodeURIComponent(value);
                      }
                    });
                    return cookies;
                  })(),
                  localStorage: (() => {
                    const items: Record<string, string> = {};
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key) {
                        items[key] = localStorage.getItem(key) || "";
                      }
                    }
                    return items;
                  })(),
                  sessionStorage: (() => {
                    const items: Record<string, string> = {};
                    for (let i = 0; i < sessionStorage.length; i++) {
                      const key = sessionStorage.key(i);
                      if (key) {
                        items[key] = sessionStorage.getItem(key) || "";
                      }
                    }
                    return items;
                  })(),
                },
                null,
                2
              )}
            </Typography>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Network Connection Information
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Connection type and network status (WiFi vs Cellular)
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {JSON.stringify(
                (() => {
                  type NavigatorWithConnection = Navigator & {
                    connection?: NetworkInformation;
                    mozConnection?: NetworkInformation;
                    webkitConnection?: NetworkInformation;
                  };
                  interface NetworkInformation {
                    effectiveType?: string;
                    type?: string;
                    downlink?: number;
                    rtt?: number;
                    saveData?: boolean;
                  }
                  const navConn = navigator as NavigatorWithConnection;
                  const connection =
                    navConn.connection ||
                    navConn.mozConnection ||
                    navConn.webkitConnection;

                  if (!connection) {
                    return {
                      supported: false,
                      message: "Network Information API not supported in this browser",
                      onLine: navigator.onLine,
                    };
                  }

                  return {
                    supported: true,
                    onLine: navigator.onLine,
                    type: connection.type || "unknown",
                    effectiveType: connection.effectiveType || "unknown",
                    downlinkMbps: connection.downlink || "unknown",
                    rttMs: connection.rtt || "unknown",
                    saveData: connection.saveData || false,
                    connectionDescription:
                      connection.type === "wifi"
                        ? "WiFi"
                        : connection.type === "cellular"
                          ? "Cellular/Mobile Data"
                          : connection.type === "ethernet"
                            ? "Ethernet"
                            : connection.type === "none"
                              ? "No connection"
                              : connection.type || "Unknown",
                  };
                })(),
                null,
                2
              )}
            </Typography>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Current Status
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Current sync and network status used by the indicator
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor:
                      syncStatus === "active"
                        ? "success.main"
                        : syncStatus === "paused"
                          ? "warning.main"
                          : "grey.500",
                  }}
                />
                <Typography variant="body2">
                  syncStatus: <strong>{syncStatus}</strong>
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: isPWAMode() ? "success.main" : "grey.500",
                  }}
                />
                <Typography variant="body2">
                  isPwa: <strong>{isPWAMode() ? "true" : "false"}</strong>
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: isWiFi ? "success.main" : "warning.main",
                  }}
                />
                <Typography variant="body2">
                  isWifi: <strong>{isWiFi ? "true" : "false"}</strong>
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor: isNetworkSupported ? "success.main" : "grey.500",
                  }}
                />
                <Typography variant="body2">
                  isNetworkSupported: <strong>{isNetworkSupported ? "true" : "false"}</strong>
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    backgroundColor:
                      isNetworkSupported && syncStatus !== "disabled" ? "success.main" : "grey.500",
                  }}
                />
                <Typography variant="body2">
                  indicatorVisible:{" "}
                  <strong>
                    {isNetworkSupported && syncStatus !== "disabled" ? "true" : "false"}
                  </strong>
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Sync Indicator Preview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {isNetworkSupported && syncStatus !== "disabled"
                ? "The 3 possible indicator states (current state is highlighted)"
                : "Indicator not visible (Network API not supported or sync disabled)"}
            </Typography>
            <Box sx={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
              {/* Active state */}
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    backgroundColor: "background.paper",
                    borderRadius: "50%",
                    width: 56,
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isNetworkSupported && syncStatus === "active" ? 6 : 1,
                    border: "2px solid",
                    borderColor: "success.main",
                    opacity: isNetworkSupported && syncStatus === "active" ? 1 : 0.4,
                  }}
                >
                  <CloudQueueIcon sx={{ color: "success.main", fontSize: 32 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: isNetworkSupported && syncStatus === "active" ? "bold" : "normal",
                  }}
                >
                  Active
                </Typography>
              </Box>

              {/* Paused state */}
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    backgroundColor: "background.paper",
                    borderRadius: "50%",
                    width: 56,
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isNetworkSupported && syncStatus === "paused" ? 6 : 1,
                    border: "2px solid",
                    borderColor: "warning.main",
                    opacity: isNetworkSupported && syncStatus === "paused" ? 1 : 0.4,
                  }}
                >
                  <CloudOffIcon sx={{ color: "warning.main", fontSize: 32 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: isNetworkSupported && syncStatus === "paused" ? "bold" : "normal",
                  }}
                >
                  Paused
                </Typography>
              </Box>

              {/* Disabled state */}
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    backgroundColor: "background.paper",
                    borderRadius: "50%",
                    width: 56,
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: !isNetworkSupported || syncStatus === "disabled" ? 6 : 1,
                    border: "2px solid",
                    borderColor: "grey.500",
                    opacity: !isNetworkSupported || syncStatus === "disabled" ? 1 : 0.4,
                  }}
                >
                  <CloudIcon sx={{ color: "grey.500", fontSize: 32 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      !isNetworkSupported || syncStatus === "disabled" ? "bold" : "normal",
                  }}
                >
                  {!isNetworkSupported ? "Not Supported" : "Disabled"}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Build-Time Environment Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These values were baked into the build at build time (static hosting)
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {JSON.stringify(
                {
                  buildInfo: {
                    timestamp: BUILD_TIMESTAMP,
                    mode: import.meta.env.MODE,
                    isDebug: environmentConfig.isDebugMode,
                  },
                  buildTimeEnvVars: {
                    VITE_DEBUG: import.meta.env.VITE_DEBUG || "undefined",
                    VITE_BUILD_TIMESTAMP: import.meta.env.VITE_BUILD_TIMESTAMP || "undefined",
                    // VITE_GOOGLE_DRIVE_API_KEY: import.meta.env.VITE_GOOGLE_DRIVE_API_KEY
                    //   ? "***SET***"
                    //   : "***NOT SET***",
                    // VITE_DROPBOX_API_KEY: import.meta.env.VITE_DROPBOX_API_KEY
                    //   ? "***SET***"
                    //   : "***NOT SET***",
                  },
                  runtimeEnvironment: {
                    isDebugMode: environmentConfig.isDebugMode,
                    defaultCorsProxy: environmentConfig.defaultCorsProxy,
                    apiKeysConfigured: {
                      googleDrive: !!environmentConfig.apiKeys.googleDrive,
                      dropbox: !!environmentConfig.apiKeys.dropbox,
                    },
                  },
                },
                null,
                2
              )}
            </Typography>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Database Summary
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {JSON.stringify(
                {
                  totalArticles: articles.length,
                  danglingItemsCount: danglingItems.length,
                  orphanedArticlesCount: orphanedArticles.length,
                  databaseInfo: {
                    name: db.name,
                    version: db.version,
                    tables: Object.keys(db),
                  },
                },
                null,
                2
              )}
            </Typography>
          </Box>

          <Box sx={{ mt: 4, p: 3, backgroundColor: "background.default", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              IndexedDB Diagnostics
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Detailed statistics from the IndexedDB database
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {indexedDbStats
                ? JSON.stringify(
                    {
                      totalCount: indexedDbStats.totalCount,
                      countsByState: indexedDbStats.countsByState,
                      dateRange: {
                        oldestIngestDate: indexedDbStats.oldestIngestDate
                          ? new Date(indexedDbStats.oldestIngestDate).toISOString()
                          : null,
                        newestIngestDate: indexedDbStats.newestIngestDate
                          ? new Date(indexedDbStats.newestIngestDate).toISOString()
                          : null,
                      },
                      tableInfo: {
                        name: db.name,
                        version: db.version,
                        tables: Object.keys(db),
                      },
                    },
                    null,
                    2
                  )
                : "Calculating..."}
            </Typography>
          </Box>

          <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
            Dangling Remote Storage Directories ({danglingItems.length})
            {isScanningDangling && (
              <Chip label="Scanning..." size="small" color="info" sx={{ ml: 2 }} />
            )}
          </Typography>

          {danglingItems.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Path</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {danglingItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                        >
                          {item.path}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box
              sx={{
                mt: 2,
                p: 3,
                backgroundColor: "grey.100",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="body1" color="text.secondary">
                {isScanningDangling
                  ? "Scanning remote storage for directories..."
                  : "No dangling directories found in remote storage."}
              </Typography>
            </Box>
          )}

          <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
            Articles ({articles.length})
          </Typography>

          <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <strong>Title</strong>
                  </TableCell>
                  <TableCell>
                    <strong>State</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Ingest Date</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {articles.map((article) => (
                  <TableRow key={article.slug}>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 200, wordBreak: "break-word" }}>
                        {article.title || "No title"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {article.state}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {article.ingestDate
                          ? new Date(article.ingestDate).toLocaleString()
                          : "Unknown"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h6" component="h2" gutterBottom sx={{ mt: 3 }}>
            Orphaned Database Articles ({orphanedArticles.length})
            {isScanningOrphaned && (
              <Chip label="Scanning..." size="small" color="info" sx={{ ml: 2 }} />
            )}
          </Typography>

          {orphanedArticles.length > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <strong>Title</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Slug</strong>
                    </TableCell>
                    <TableCell>
                      <strong>URL</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Reason</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orphanedArticles.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, wordBreak: "break-word" }}>
                          {item.article.title || "No title"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                          {item.article.slug}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, wordBreak: "break-all" }}>
                          {item.article.url || "No URL"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={item.reason} color="warning" size="small" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box
              sx={{
                mt: 2,
                p: 3,
                backgroundColor: "grey.100",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="body1" color="text.secondary">
                {isScanningOrphaned
                  ? "Scanning database for orphaned articles..."
                  : "No orphaned articles found in database."}
              </Typography>
            </Box>
          )}

          {articles.length === 0 && (
            <Box
              sx={{
                mt: 3,
                p: 3,
                backgroundColor: "background.default",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="body1" color="text.secondary">
                No articles found in the database.
              </Typography>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
