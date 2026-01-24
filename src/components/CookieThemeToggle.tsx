import React, { useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import {
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
} from "@mui/icons-material";
import { getThemeFromCookie, toggleTheme, ThemeMode } from "~/utils/cookies";

interface CookieThemeToggleProps {
  size?: "small" | "medium" | "large";
  onThemeChange?: () => void;
}

export const CookieThemeToggle: React.FC<CookieThemeToggleProps> = ({
  size = "medium",
  onThemeChange,
}) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getThemeFromCookie());

  const handleToggle = () => {
    const newTheme = toggleTheme();
    setCurrentTheme(newTheme);

    // Dispatch custom event to notify theme change
    window.dispatchEvent(new CustomEvent("themeChanged"));

    if (onThemeChange) {
      onThemeChange();
    }
  };

  const getIcon = () => {
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

  const getTooltip = () => {
    switch (currentTheme) {
      case "light":
        return "Switch to dark mode";
      case "dark":
        return "Switch to system mode";
      case "system":
        return "Switch to light mode";
      default:
        return "Toggle theme";
    }
  };

  return (
    <Tooltip title={getTooltip()}>
      <IconButton
        onClick={handleToggle}
        color="inherit"
        size={size}
        sx={{
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            transform: "rotate(15deg)",
          },
        }}
      >
        {getIcon()}
      </IconButton>
    </Tooltip>
  );
};
