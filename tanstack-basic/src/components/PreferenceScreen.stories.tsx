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

// Custom CORS proxy configuration
export const CustomCorsProxy: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preference screen with custom CORS proxy configuration.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    // This would be used for interactions if we had access to the component's internal state
    // For now, this demonstrates the story structure
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
};

// Tablet viewport
export const Tablet: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "Preference screen on tablet device viewport.",
      },
    },
  },
};

// Desktop viewport
export const Desktop: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "desktop",
    },
    docs: {
      description: {
        story: "Preference screen on desktop viewport.",
      },
    },
  },
};

// Interactive theme toggle
export const InteractiveThemeToggle: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "Interactive preference screen where you can toggle between light and dark themes by clicking the theme option.",
      },
    },
  },
};

// CORS proxy editing
export const CorsProxyEditing: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preference screen where you can edit the CORS proxy URL in the text field.",
      },
    },
  },
};

// All sections expanded
export const AllSections: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "Complete preference screen showing all sections: Fetching content, Reading preferences, and About information.",
      },
    },
  },
};

// Accessibility focused
export const Accessibility: Story = {
  args: {},
  parameters: {
    a11y: {
      config: {
        rules: [
          {
            id: "color-contrast",
            enabled: true,
          },
          {
            id: "button-name",
            enabled: true,
          },
        ],
      },
    },
    docs: {
      description: {
        story: "Preference screen with accessibility testing enabled.",
      },
    },
  },
};

// Performance testing
export const Performance: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Preference screen for performance testing and monitoring.",
      },
    },
  },
};
