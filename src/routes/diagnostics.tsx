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
} from "@mui/material";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "~/utils/db";
import { calculateArticleStorageSize } from "~/utils/storage";
import React from "react";

export const Route = createFileRoute("/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  // Get all articles from the database
  const articles = useLiveQuery(() => db.articles.toArray());
  const [storageSizes, setStorageSizes] = React.useState<Record<string, number>>({});

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

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default", pt: 4 }}>
      <Container maxWidth="lg">
        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Database Diagnostics
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
                    <strong>Slug</strong>
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
                        {article.slug}
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
                          ? `${storageSizes[article.slug]} bytes`
                          : "Calculating..."}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {article.ingestDate
                          ? new Date(article.ingestDate).toLocaleDateString()
                          : "Unknown"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {articles.length === 0 && (
            <Box
              sx={{
                mt: 3,
                p: 3,
                backgroundColor: "grey.100",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="body1" color="text.secondary">
                No articles found in the database.
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 4, p: 3, backgroundColor: "grey.100", borderRadius: 1 }}>
            <Typography variant="h6" component="h3" gutterBottom>
              Database Summary
            </Typography>
            <Typography variant="body2" component="pre" sx={{ wordBreak: "break-all" }}>
              {JSON.stringify(
                {
                  totalArticles: articles.length,
                  totalStorageSize,
                  averageStorageSize,
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
