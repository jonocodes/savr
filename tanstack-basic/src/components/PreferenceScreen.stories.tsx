import type { Meta, StoryObj } from "@storybook/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import PreferenceScreen from "./PreferenceScreen";

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
  decorators: [
    (Story) => (
      <ThemeProvider theme={createTheme()}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
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
  decorators: [
    (Story) => (
      <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
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
    (Story) => (
      <div style={{ width: "400px", margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
};
