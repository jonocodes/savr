import type { Meta, StoryObj } from "@storybook/react";
import PreferenceScreen from "./PreferenceScreen";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { setThemeInCookie } from "~/utils/cookies";
import { createAppTheme } from "~/utils/theme";
import type { ComponentType } from "react";

// Theme decorator that sets up the theme based on cookie
const withTheme = (themeMode: "light" | "dark" | "system") => (Story: ComponentType) => {
  // Set the theme in cookie for the story
  if (typeof document !== "undefined") {
    setThemeInCookie(themeMode);
  }

  const theme = createAppTheme(themeMode);

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
      <div style={{ width: "400px", margin: "0 auto", border: "1px solid black" }}>
        <Story />
      </div>
    ),
  ],
};
