import React, { useEffect, useState } from "react";
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
  ThemeProvider,
  createTheme,
  CssBaseline,
  Paper,
  Container,
  Divider,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  BookmarkAdd as BookmarkAddIcon,
  Web as WebIcon,
  LightMode as LightModeIcon,
  Info as InfoIcon,
  Computer as ComputerIcon,
} from "@mui/icons-material";

// Mock data for demonstration
const mockVersion = "1.0.0";
const mockPlatform = "web";

// Mock theme store
const useMockThemeStore = () => {
  const [theme, setTheme] = useState<{
    name: string;
    palette: {
      mode: "light" | "dark";
      primary: { main: string };
      secondary: { main: string };
    };
  }>({
    name: "light",
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

  const toggleTheme = () => {
    setTheme((prev) => ({
      ...prev,
      name: prev.name === "light" ? "dark" : "light",
      palette: {
        ...prev.palette,
        mode: prev.palette.mode === "light" ? "dark" : "light",
      },
    }));
  };

  return { theme, setTheme: toggleTheme };
};

// Mock store
const useMockStore = () => {
  const [corsProxy, setCorsProxy] = useState("https://cors-anywhere.herokuapp.com/");

  return { corsProxy, setCorsProxy };
};

// Bookmarklet for development
const bookmarklet =
  "javascript:(function(){const app = 'http://localhost:8081'; var s = document.createElement('script'); s.src = app + '/bookmarklet-client.js'; document.body.appendChild(s); })();";

export default function PreferencesScreen() {
  const { theme, setTheme } = useMockThemeStore();
  const { corsProxy, setCorsProxy } = useMockStore();

  const handleBack = () => {
    console.log("Navigate back to home");
  };

  const handleThemeToggle = () => {
    setTheme();
  };

  const handleCorsProxyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCorsProxy(event.target.value);
  };

  const muiTheme = createTheme({
    palette: {
      mode: theme.palette.mode,
      primary: {
        main: "#1976d2",
      },
      secondary: {
        main: "#dc004e",
      },
    },
  });

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, backgroundColor: "background.default" }}>
        {/* Header */}
        <AppBar position="static">
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
                    href={bookmarklet}
                    style={{
                      color: muiTheme.palette.primary.main,
                      textDecoration: "none",
                      fontWeight: "bold",
                    }}
                  >
                    savr save
                  </a>
                </Box>
              </ListItem>

              <Divider />

              <ListItem>
                <ListItemIcon>
                  <WebIcon />
                </ListItemIcon>
                <ListItemText
                  primary="CORS Proxy"
                  secondary="Proxy server for cross-origin requests"
                />
                <TextField
                  value={corsProxy}
                  onChange={handleCorsProxyChange}
                  placeholder="https://"
                  size="small"
                  sx={{ minWidth: 200 }}
                />
              </ListItem>
            </List>

            <Divider />

            {/* Reading Section */}
            <List>
              <ListSubheader>Reading</ListSubheader>

              <ListItem button onClick={handleThemeToggle}>
                <ListItemIcon>
                  <LightModeIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Theme"
                  secondary={theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
                />
              </ListItem>
            </List>

            <Divider />

            {/* About Section */}
            <List>
              <ListSubheader>About</ListSubheader>

              <ListItem>
                <ListItemIcon>
                  <InfoIcon />
                </ListItemIcon>
                <ListItemText primary="Version" secondary={mockVersion} />
              </ListItem>

              <ListItem>
                <ListItemIcon>
                  <ComputerIcon />
                </ListItemIcon>
                <ListItemText primary="Platform" secondary={mockPlatform} />
              </ListItem>
            </List>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
