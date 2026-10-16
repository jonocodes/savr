import React, { useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import {
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  SettingsBrightness as SettingsBrightnessIcon,
} from "@mui/icons-material";
import { getThemeFromCookie, toggleTheme, ThemeMode } from "~/utils/cookies";
import { useTranslation } from "react-i18next";

interface CookieThemeToggleProps {
  size?: "small" | "medium" | "large";
  onThemeChange?: () => void;
}

export const CookieThemeToggle: React.FC<CookieThemeToggleProps> = ({
  size = "medium",
  onThemeChange,
}) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getThemeFromCookie());
  const { t } = useTranslation();

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
        return t("common.themeToDark");
      case "dark":
        return t("common.themeToSystem");
      case "system":
        return t("common.themeToLight");
      default:
        return t("common.themeToggle");
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
