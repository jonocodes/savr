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
} from "@mui/material";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { useRemoteStorage } from "~/components/RemoteStorageProvider";
import { environmentConfig, BUILD_TIMESTAMP } from "~/config/environment";
import React from "react";

export default function DiagnosticsScreen() {
  // Get all articles from the database
  const articles = useLiveQuery(() => db.articles.toArray());
  const [danglingItems, setDanglingItems] = React.useState<
    Array<{
      path: string;
      type: "directory";
      details: any;
    }>
  >([]);
  const [isScanningDangling, setIsScanningDangling] = React.useState(false);
  const [orphanedArticles, setOrphanedArticles] = React.useState<
    Array<{
      article: any;
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

  const { client: remoteStorageClient } = useRemoteStorage();

  // Scan for dangling remote storage items (only check saves/ directory)
  const scanDanglingItems = React.useCallback(async () => {
    if (!remoteStorageClient || !articles) return;

    setIsScanningDangling(true);
    setDanglingItems([]); // Clear previous results
    try {
      // Only list the saves/ directory - no need for recursive scanning
      const listing = await remoteStorageClient.getListing("saves/");

      const dangling: Array<{
        path: string;
        type: "directory";
        details: any;
      }> = [];

      for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
        if (name.endsWith("/")) {
          // This is a directory in saves/
          const dirPath = `saves/${name}`;
          dangling.push({
            path: dirPath,
            type: "directory",
            details: {
              message: "Article directory found in remote storage",
              slug: name.slice(0, -1), // Remove trailing slash
            },
          });
        }
      }

      setDanglingItems(dangling);
    } catch (error) {
      console.error("Failed to scan directories:", error);
    } finally {
      setIsScanningDangling(false);
    }
  }, [remoteStorageClient, articles?.length]);

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
      for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
        if (name.endsWith("/")) {
          existingDirs.add(name.slice(0, -1)); // Remove trailing slash
        }
      }

      // Check each article
      const orphaned: Array<{
        article: any;
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
                        (window.navigator as any).standalone === true ||
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
            Remote Storage Directories ({danglingItems.length})
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
                  : "No directories found in remote storage."}
              </Typography>
            </Box>
          )}

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
