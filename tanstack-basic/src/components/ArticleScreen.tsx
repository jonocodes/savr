import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Paper,
  Container,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  MoreVert as MoreVertIcon,
  Code as CodeIcon,
  TextFields as TextFieldsIcon,
  OpenInNew as OpenInNewIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

// Mock data
const mockArticle = {
  slug: "sample-article",
  title: "Sample Article Title",
  url: "https://example.com/article",
  state: "unread" as const,
  content: `
    <h1>Sample Article Content</h1>
    <p>This is a sample article to demonstrate the MUI-based article reader.</p>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
    <h2>Features</h2>
    <ul>
      <li>Material-UI components</li>
      <li>Responsive design</li>
      <li>Font size controls</li>
      <li>Archive/unarchive functionality</li>
    </ul>
  `,
};

export default function ArticleScreen() {
  // const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(16);
  const [viewMode, setViewMode] = useState<"cleaned" | "original">("cleaned");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleVisitOriginal = () => {
    window.open(mockArticle.url, "_blank");
    closeMenu();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(mockArticle.url);
    alert("Url copied to clipboard: " + mockArticle.url);
    closeMenu();
  };

  const handleDelete = () => {
    alert("Delete functionality would be implemented here");
    // navigate({ to: "/" });
  };

  const handleArchive = () => {
    alert("Archive functionality would be implemented here");
    // navigate({ to: "/" });
  };

  const handleUnarchive = () => {
    alert("Unarchive functionality would be implemented here");
    // navigate({ to: "/" });
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            // onClick={
            //   () => {} //navigate({ to: "/" })
            // }
            onClick={() => (window.location.href = "/")}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>

          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {mockArticle.title}
          </Typography>

          <Tooltip title="Increase font size">
            <IconButton color="inherit" onClick={() => setFontSize(fontSize + 2)}>
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Decrease font size">
            <IconButton color="inherit" onClick={() => setFontSize(fontSize - 2)}>
              <RemoveIcon />
            </IconButton>
          </Tooltip>

          {mockArticle.state === ("archived" as any) ? (
            <Tooltip title="Unarchive">
              <IconButton color="inherit" onClick={handleUnarchive}>
                <UnarchiveIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Archive">
              <IconButton color="inherit" onClick={handleArchive}>
                <ArchiveIcon />
              </IconButton>
            </Tooltip>
          )}

          <IconButton color="inherit" onClick={openMenu}>
            <MoreVertIcon />
          </IconButton>

          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
            {viewMode === "cleaned" && (
              <MenuItem
                onClick={() => {
                  setViewMode("original");
                  closeMenu();
                }}
              >
                <ListItemIcon>
                  <CodeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Show Original</ListItemText>
              </MenuItem>
            )}

            {viewMode === "original" && (
              <MenuItem
                onClick={() => {
                  setViewMode("cleaned");
                  closeMenu();
                }}
              >
                <ListItemIcon>
                  <TextFieldsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Show Cleaned</ListItemText>
              </MenuItem>
            )}

            <MenuItem onClick={handleVisitOriginal}>
              <ListItemIcon>
                <OpenInNewIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Visit Original</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleShare}>
              <ListItemIcon>
                <ShareIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Share</ListItemText>
            </MenuItem>

            <MenuItem onClick={handleDelete}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box
            sx={{
              fontSize: fontSize,
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: mockArticle.content }}
          />
        </Paper>
      </Container>
    </Box>
  );
}
