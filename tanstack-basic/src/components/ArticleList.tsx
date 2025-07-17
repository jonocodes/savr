import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  IconButton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  Tooltip,
  ThemeProvider,
  createTheme,
  CssBaseline,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Avatar,
  Card,
  CardContent,
  Container,
  Paper,
} from "@mui/material";
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Article as ArticleIcon,
  Archive as ArchiveIcon2,
} from "@mui/icons-material";

// Mock data for demonstration
const mockArticles = [
  {
    slug: "sample-article-1",
    title: "Sample Article Title 1",
    url: "https://example.com/article1",
    state: "unread" as const,
    ingestDate: new Date("2024-01-15"),
    description: "This is a sample article description for demonstration purposes.",
  },
  {
    slug: "sample-article-2",
    title: "Sample Article Title 2",
    url: "https://example.com/article2",
    state: "archived" as const,
    ingestDate: new Date("2024-01-10"),
    description: "Another sample article description for demonstration purposes.",
  },
  {
    slug: "sample-article-3",
    title: "Sample Article Title 3",
    url: "https://example.com/article3",
    state: "unread" as const,
    ingestDate: new Date("2024-01-05"),
    description: "Yet another sample article description for demonstration purposes.",
  },
];

const sampleArticleUrls = [
  "https://www.apalrd.net/posts/2023/network_ipv6/",
  "https://getpocket.com/explore/item/is-matter-conscious",
  "https://medium.com/androiddevelopers/jetnews-for-every-screen-4d8e7927752",
  "https://theconversation.com/records-of-pompeiis-survivors-have-been-found-and-archaeologists-are-starting-to-understand-how-they-rebuilt-their-lives-230641",
  "https://en.m.wikipedia.org/wiki/Dune:_Part_Two",
  "https://lifehacker.com/home/how-to-make-more-kitchen-counter-space",
  "http://leejo.github.io/2024/09/01/off_by_one/",
  "https://www.troyhunt.com/inside-the-3-billion-people-national-public-data-breach/",
  "https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881",
  "https://leejo.github.io/2024/09/29/holding_out_for_the_heros_to_fuck_off/",
];

interface Article {
  slug: string;
  title: string;
  url: string;
  state: "unread" | "archived";
  ingestDate: Date;
  description: string;
}

function ArticleItem({ item }: { item: Article }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(item.url);
    alert("Url copied to clipboard: " + item.url);
    closeMenu();
  };

  const handleArchive = () => {
    alert("Archive functionality would be implemented here");
    closeMenu();
  };

  const handleUnarchive = () => {
    alert("Unarchive functionality would be implemented here");
    closeMenu();
  };

  const handleDelete = () => {
    alert("Delete functionality would be implemented here");
    closeMenu();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  return (
    <ListItem
      sx={{
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:hover": {
          backgroundColor: "action.hover",
        },
      }}
    >
      <ListItemAvatar
        onClick={() => navigate({ to: "/article/$slug", params: { slug: item.slug } })}
      >
        <Avatar>
          <ArticleIcon />
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        onClick={() => navigate({ to: "/article/$slug", params: { slug: item.slug } })}
        primary={item.title}
        secondary={
          <Box>
            <Typography variant="body2" color="text.secondary">
              {item.description}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(item.ingestDate)}
            </Typography>
          </Box>
        }
      />
      <IconButton onClick={openMenu}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        {item.state === "archived" ? (
          <MenuItem onClick={handleUnarchive}>
            <ListItemIcon>
              <UnarchiveIcon fontSize="small" />
            </ListItemIcon>
            Unarchive
          </MenuItem>
        ) : (
          <MenuItem onClick={handleArchive}>
            <ListItemIcon>
              <ArchiveIcon fontSize="small" />
            </ListItemIcon>
            Archive
          </MenuItem>
        )}
        <MenuItem onClick={handleShare}>
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          Share
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </ListItem>
  );
}

export default function ArticleListScreen({ initialArticles }: { initialArticles?: Article[] }) {
  const navigate = useNavigate();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [articles] = useState<Article[]>(initialArticles || mockArticles);
  const [filter, setFilter] = useState<"unread" | "archived">("unread");
  const [url, setUrl] = useState<string>("");
  const [ingestPercent, setIngestPercent] = useState<number>(0);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const theme = createTheme({
    palette: {
      mode: "light",
      primary: {
        main: "#1976d2",
      },
      secondary: {
        main: "#dc004e",
      },
    },
  });

  const filteredArticles = articles.filter((article) => article.state === filter);

  const saveUrl = async () => {
    setIngestPercent(0);
    setIngestStatus("Starting ingestion...");

    // Simulate progress
    const interval = setInterval(() => {
      setIngestPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setDialogVisible(false);
            setIngestPercent(0);
            setIngestStatus(null);
          }, 1000);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    setIngestStatus("Processing article...");
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, backgroundColor: "background.default" }}>
        {/* Header */}
        <Paper
          elevation={1}
          sx={{
            p: 2,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Tooltip title="Add article">
            <IconButton
              onClick={() => {
                setDialogVisible(true);
                setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
              }}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>

          <ToggleButtonGroup
            value={filter}
            exclusive
            onChange={(_, newFilter) => {
              if (newFilter !== null) {
                setFilter(newFilter);
              }
            }}
            size="small"
          >
            <ToggleButton value="unread">
              <ArticleIcon sx={{ mr: 1 }} />
              Saves
            </ToggleButton>
            <ToggleButton value="archived">
              <ArchiveIcon2 sx={{ mr: 1 }} />
              Archive
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Settings">
            <IconButton onClick={() => navigate({ to: "/prefs" })}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Paper>

        {/* Content */}
        <Container maxWidth="md" sx={{ mt: 2 }}>
          {filteredArticles.length > 0 ? (
            <Paper elevation={1}>
              <List>
                {filteredArticles.map((item) => (
                  <ArticleItem key={item.slug} item={item} />
                ))}
              </List>
            </Paper>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "50vh",
                textAlign: "center",
              }}
            >
              <Typography variant="h4" gutterBottom>
                Welcome to Savr
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {filter === "unread"
                  ? "Start saving articles to see them here"
                  : "No archived articles yet"}
              </Typography>
              <Button
                variant="contained"
                onClick={() => {
                  setDialogVisible(true);
                  setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
                }}
                sx={{ mt: 2 }}
              >
                Add Article
              </Button>
            </Box>
          )}
        </Container>

        {/* Add Article Dialog */}
        <Dialog
          open={dialogVisible}
          onClose={() => setDialogVisible(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Add Article</DialogTitle>
          <DialogContent>
            <TextField
              label="URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              fullWidth
              margin="normal"
            />

            {ingestPercent > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {ingestStatus}
                </Typography>
                <LinearProgress variant="determinate" value={ingestPercent} />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogVisible(false)}>Cancel</Button>
            <Button onClick={saveUrl} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>

        {/* Floating Action Button */}
        {/* <Fab
          color="primary"
          aria-label="add"
          sx={{
            position: "fixed",
            bottom: 16,
            right: 16,
          }}
          onClick={() => {
            setDialogVisible(true);
            setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
          }}
        >
          <AddIcon />
        </Fab> */}
      </Box>
    </ThemeProvider>
  );
}
