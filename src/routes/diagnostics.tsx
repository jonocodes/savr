import { createFileRoute } from "@tanstack/react-router";
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
import React from "react";

export const Route = createFileRoute("/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
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

  const { client: remoteStorageClient } = useRemoteStorage();

  // Calculate storage sizes for all articles
  React.useEffect(() => {
    if (articles) {
      const calculateSizes = async () => {
        const sizes: Record<string, number> = {};
        for (const article of articles) {
          try {
            const sizeInfo = await calculateArticleStorageSize(article.slug);
            sizes[article.slug] = sizeInfo.totalSize;
          } catch (error) {
            console.error(`Failed to calculate size for ${article.slug}:`, error);
            sizes[article.slug] = 0;
          }
        }
        setStorageSizes(sizes);
      };
      calculateSizes();
    }
  }, [articles]);

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
  }, [remoteStorageClient, articles]);

  React.useEffect(() => {
    if (remoteStorageClient && articles) {
      scanDanglingItems();
    }
  }, [remoteStorageClient, articles, scanDanglingItems]);

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
    articles.length > 0 ? Math.round(totalStorageSize / articles.length) : 0;

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
        </Paper>
      </Container>
    </Box>
  );
}
