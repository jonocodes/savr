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
import { calculateArticleStorageSize, formatBytes } from "~/utils/storage";
import { useRemoteStorage } from "~/components/RemoteStorageProvider";
import { environmentConfig, BUILD_TIMESTAMP } from "~/config/environment";
import React from "react";

export default function DiagnosticsScreen() {
  // Get all articles from the database
  const articles = useLiveQuery(() => db.articles.toArray());
  const [storageSizes, setStorageSizes] = React.useState<Record<string, number>>({});
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

  const { client: remoteStorageClient } = useRemoteStorage();

  // Calculate storage sizes for all articles
  React.useEffect(() => {
    if (articles) {
      const calculateSizes = async () => {
        const sizes: Record<string, number> = {};
        setStorageSizes(sizes); // Initialize with empty object

        for (const article of articles) {
          try {
            const sizeInfo = await calculateArticleStorageSize(article.slug);
            const newSize = sizeInfo.totalSize;
            sizes[article.slug] = newSize;

            // Update the state immediately for each completed calculation
            setStorageSizes((prevSizes) => ({
              ...prevSizes,
              [article.slug]: newSize,
            }));

            console.log(`Calculated size for ${article.slug}:`, newSize);
          } catch (error) {
            console.error(`Failed to calculate size for ${article.slug}:`, error);
            const errorSize = 0;
            sizes[article.slug] = errorSize;

            // Update state immediately even for errors
            setStorageSizes((prevSizes) => ({
              ...prevSizes,
              [article.slug]: errorSize,
            }));
          }
        }
      };
      calculateSizes();
    }
  }, [articles?.length]);

  // Scan for dangling remote storage items
  const scanDanglingItems = React.useCallback(async () => {
    if (!remoteStorageClient || !articles) return;

    setIsScanningDangling(true);
    try {
      const allDirectories: string[] = [];
      const dangling: Array<{
        path: string;
        type: "directory";
        details: any;
      }> = [];

      // Get all remote storage directories recursively
      const getListingRecursive = async (path: string = ""): Promise<void> => {
        try {
          const listing = await remoteStorageClient.getListing(path);
          for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
            const fullPath = path + name;
            if (name.endsWith("/")) {
              // This is a directory
              allDirectories.push(fullPath);
              // Recursively list subfolder
              await getListingRecursive(fullPath);
            }
          }
        } catch (error) {
          console.warn(`Failed to get listing for ${path}:`, error);
        }
      };

      await getListingRecursive();

      // Add all directories to the list
      for (const dirPath of allDirectories) {
        // Only show directories that are exactly 2 levels deep: /saves/slug/
        const pathParts = dirPath.split("/").filter((part) => part.length > 0);
        if (pathParts.length === 2 && pathParts[0] === "saves") {
          dangling.push({
            path: dirPath,
            type: "directory",
            details: {
              message: "Article directory found in remote storage",
              slug: pathParts[1],
              pathDepth: pathParts.length,
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
      console.log("scanOrphanedArticles: Missing requirements", {
        hasClient: !!remoteStorageClient,
        hasArticles: !!articles,
        articlesLength: articles?.length,
      });
      return;
    }

    console.log("scanOrphanedArticles: Starting scan", {
      articlesCount: articles.length,
      clientAvailable: !!remoteStorageClient,
    });

    setIsScanningOrphaned(true);
    try {
      const orphaned: Array<{
        article: any;
        reason: string;
      }> = [];

      // Get all remote storage directories
      const allDirectories: string[] = [];
      const getListingRecursive = async (path: string = ""): Promise<void> => {
        try {
          console.log("scanOrphanedArticles: Getting listing for path:", path);
          const listing = await remoteStorageClient.getListing(path);
          console.log("scanOrphanedArticles: Got listing for", path, listing);

          for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
            const fullPath = path + name;
            if (name.endsWith("/")) {
              allDirectories.push(fullPath);
              console.log("scanOrphanedArticles: Added directory:", fullPath);
              await getListingRecursive(fullPath);
            }
          }
        } catch (error) {
          console.error(`scanOrphanedArticles: Failed to get listing for ${path}:`, error);
        }
      };

      await getListingRecursive();
      console.log("scanOrphanedArticles: All directories found:", allDirectories);

      // Check each article for missing remote storage directory
      for (const article of articles) {
        const expectedDir = `saves/${article.slug}/`;
        const hasDirectory = allDirectories.includes(expectedDir);

        console.log("scanOrphanedArticles: Checking article", {
          slug: article.slug,
          expectedDir,
          hasDirectory,
          allDirectories: allDirectories.filter((d) => d.startsWith("saves/")),
        });

        if (!hasDirectory) {
          orphaned.push({
            article,
            reason: "Missing remote storage directory",
          });
          console.log("scanOrphanedArticles: Found orphaned article:", article.slug);
        }
      }

      console.log("scanOrphanedArticles: Scan complete", {
        totalArticles: articles.length,
        totalDirectories: allDirectories.length,
        orphanedCount: orphaned.length,
        orphaned: orphaned.map((o) => o.article.slug),
      });

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

  const totalStorageSize = Object.values(storageSizes).reduce((sum, size) => sum + size, 0);
  const averageStorageSize =
    articles!.length > 0 ? Math.round(totalStorageSize / articles!.length) : 0;

  const getTypeColor = (type: string) => {
    switch (type) {
      case "directory":
        return "primary";
      default:
        return "default";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "directory":
        return "Directory";
      default:
        return type;
    }
  };

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
                  totalStorageSize,
                  averageStorageSize,
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
                    <strong>URL</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Storage Size</strong>
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
                      <Typography variant="body2" sx={{ maxWidth: 200, wordBreak: "break-all" }}>
                        {article.url || "No URL"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {storageSizes[article.slug] !== undefined
                          ? `${formatBytes(storageSizes[article.slug])} bytes`
                          : "Calculating..."}
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
                    <TableCell>
                      <strong>Type</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Details</strong>
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
                      <TableCell>
                        <Chip
                          label={getTypeLabel(item.type)}
                          color={getTypeColor(item.type) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 300, wordBreak: "break-all" }}>
                          <pre style={{ fontSize: "0.75rem", margin: 0 }}>
                            {JSON.stringify(item.details, null, 2)}
                          </pre>
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
