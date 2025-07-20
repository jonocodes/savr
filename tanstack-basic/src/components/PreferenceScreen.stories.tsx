import type { Meta, StoryObj } from "@storybook/react";
import PreferenceScreen from "./PreferenceScreen";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { setThemeInCookie } from "~/utils/cookies";

// Theme decorator that sets up the theme based on cookie
const withTheme = (themeMode: "light" | "dark" | "system") => (Story: any) => {
  // Set the theme in cookie for the story
  if (typeof document !== "undefined") {
    setThemeInCookie(themeMode);
  }

  const theme = createTheme({
    palette: {
      mode: themeMode === "system" ? "light" : themeMode,
      primary: {
        main: "#1976d2",
      },
      secondary: {
        main: "#dc004e",
      },
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <Story />
    </ThemeProvider>
  );
};

const meta: Meta<typeof PreferenceScreen> = {
  title: "Components/PreferenceScreen",
  component: PreferenceScreen,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A preferences screen component with theme switching, CORS proxy configuration, and bookmarklet functionality.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [withTheme("light")],
  argTypes: {
    // Add any props if the component accepts them
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story
export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Default preference screen with light theme and standard configuration.",
      },
    },
  },
};

// Dark theme variant
export const DarkTheme: Story = {
  args: {},
  decorators: [withTheme("dark")],
  parameters: {
    docs: {
      description: {
        story: "Preference screen with dark theme applied.",
      },
    },
  },
};
// System theme variant
export const SystemTheme: Story = {
  args: {},
  decorators: [withTheme("system")],
  parameters: {
    docs: {
      description: {
        story: "Preference screen with system theme applied (follows OS preference).",
      },
    },
  },
};

// Mobile viewport
export const Mobile: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story: "Preference screen on mobile device viewport.",
      },
    },
  },
  decorators: [
    withTheme("light"),
    (Story) => (
      <div style={{ width: "400px", margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
};
