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
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  BookmarkAdd as BookmarkAddIcon,
  Web as WebIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
  Info as InfoIcon,
  Computer as ComputerIcon,
} from "@mui/icons-material";
import { getCorsProxyValue, setCorsProxyValue } from "~/utils/tools";
import {
  getThemeFromCookie,
  toggleTheme,
  useSystemThemeListener,
  getEffectiveTheme,
} from "~/utils/cookies";

// Mock data for demonstration
const mockVersion = "1.0.0";
const mockPlatform = "web";

// Bookmarklet for development
const bookmarklet =
  "javascript:(function(){const app = 'http://localhost:8081'; var s = document.createElement('script'); s.src = app + '/bookmarklet-client.js'; document.body.appendChild(s); })();";

export default function PreferencesScreen() {
  const [currentTheme, setCurrentTheme] = React.useState(getThemeFromCookie());
  const [corsProxy, setCorsProxy] = React.useState<string | null>(getCorsProxyValue());

  React.useEffect(() => {
    setCorsProxy(getCorsProxyValue());
  }, []);
  const navigate = useNavigate();

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
    setCorsProxyValue(value || null);
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
                    color: "primary.main",
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
              <ListItemIcon>{getThemeIcon()}</ListItemIcon>
              <ListItemText
                primary="Theme"
                secondary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {getThemeLabel()}
                    <Chip
                      label={getEffectiveTheme(currentTheme) === "dark" ? "Dark" : "Light"}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </Box>
                }
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
  );
}
