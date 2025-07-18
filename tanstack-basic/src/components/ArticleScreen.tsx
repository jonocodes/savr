import React, { useEffect, useState } from "react";
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
  Slide,
  useScrollTrigger,
} from "@mui/material";
// import useScrollTrigger from "@mui/material/useScrollTrigger";
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
import { Route } from "~/routes/article.$slug";
import { useRemoteStorage } from "./RemoteStorageProvider";
import { db } from "~/utils/db";
import { Article } from "../../../lib/src/models";
import { removeArticle, updateArticleState } from "~/utils/tools";
import { useSnackbar } from "notistack";

interface Props {
  /**
   * Injected by the documentation to work in an iframe.
   * You won't need it on your project.
   */

  window?: () => Window;
  children?: React.ReactElement<unknown>;
}

// Never got this to work. https://mui.com/material-ui/react-app-bar/#hide-app-bar
function HideOnScroll(props: Props) {
  const { children, window } = props;
  // Note that you normally won't need to set the window ref as useScrollTrigger
  // will default to window.
  // This is only being set here because the demo is in an iframe.
  const trigger = useScrollTrigger({
    target: window ? window() : undefined,
  });

  return (
    <Slide appear={false} direction="down" in={!trigger}>
      {children ?? <div />}
    </Slide>
  );
}

export default function ArticleScreen(props: Props) {
  // Get slug from URL path parameter
  // const slug = window.location.pathname.split("/").pop();
  const { slug } = Route.useParams();

  const storage = useRemoteStorage();

  const { enqueueSnackbar } = useSnackbar();

  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(16);
  const [viewMode, setViewMode] = useState<"cleaned" | "original">("cleaned");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const [html, setHtml] = useState("");

  const [content, setContent] = useState("");

  const [article, setArticle] = useState({} as Article);

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeMenu = () => {
    setAnchorEl(null);
  };

  const handleVisitOriginal = () => {
    if (article.url) {
      window.open(article.url, "_blank");
    }
    closeMenu();
  };

  const handleShare = () => {
    if (article.url) {
      navigator.clipboard.writeText(article.url);
      alert("Url copied to clipboard: " + article.url);
    }
    closeMenu();
  };

  const handleDelete = async () => {
    try {
      await removeArticle(storage.client!, article.slug);
      navigate({ to: "/" });
      enqueueSnackbar("Article deleted");
    } catch (e) {
      console.error(e);
      enqueueSnackbar("Failed to delete article", { variant: "error" });
    }
  };

  const handleArchive = () => {
    try {
      updateArticleState(storage.client!, article.slug, "archived");

      enqueueSnackbar("Article archived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to archive article", { variant: "error" });
    }
  };

  const handleUnarchive = () => {
    if (!article) throw new Error("Article is undefined");

    try {
      updateArticleState(storage.client!, article.slug, "unread");

      enqueueSnackbar("Article unarchived");
      navigate({ to: "/" });
    } catch (e) {
      console.error(e);

      enqueueSnackbar("Failed to unarchive article", { variant: "error" });
    }
  };

  useEffect(() => {
    const setup = async () => {
      db.articles.get(slug).then((article) => {
        if (!article) {
          console.error("Article not found");
          return;
        }
        setArticle(article);
      });

      try {
        if (viewMode === "original") {
          storage.client
            ?.getFile(`saves/${slug}/raw.html`)
            .then((file: any) => {
              setContent(file.data);
              setHtml(`${file.data}`);
            })
            .catch((error) => {
              console.error("Error retrieving article", error);
            });
        } else {
          storage.client
            ?.getFile(`saves/${slug}/index.html`)
            .then((file: any) => {
              setContent(file.data);
              setHtml(`<link rel="stylesheet" href="/static/web.css">${file.data}`);
            })
            .catch((error) => {
              console.error("Error retrieving article", error);
            });
        }

        console.log("loading from content article", html);
      } catch (e) {
        console.error(e);
      }
    };

    setup();
  }, [viewMode, slug, storage]);

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default" }}>
      <HideOnScroll {...props}>
        <AppBar position="static">
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => navigate({ to: "/" })}
              sx={{ mr: 2 }}
            >
              <ArrowBackIcon />
            </IconButton>

            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              {/* {article.title} */}
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

            {article.state === ("archived" as any) ? (
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
      </HideOnScroll>

      <Container maxWidth="md" sx={{ mt: 2, mb: 4 }}>
        
          <Box
            sx={{
              fontSize: fontSize,
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
      </Container>
    </Box>
  );
}
