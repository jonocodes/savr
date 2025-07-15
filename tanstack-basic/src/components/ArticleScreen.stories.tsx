import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleScreen from "./ArticleScreen";
import React from "react";
import { createRouter } from "../router";
import { RouterProvider } from "@tanstack/react-router";

// Create a minimal router for Storybook
const storybookRouter = createRouter();

const meta: Meta<typeof ArticleScreen> = {
  title: "Components/ArticleScreen",
  component: ArticleScreen,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A full-featured article reader component built with Material-UI. Includes font size controls, archive/unarchive functionality, and various viewing modes.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      // <RouterProvider router={storybookRouter}>
      <Story />
      // </RouterProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Default ArticleScreen with standard article content and controls.",
      },
    },
  },
};

export const ArchivedArticle: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "ArticleScreen component showing an archived article state with unarchive button.",
      },
    },
  },
};

export const LargeFont: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "ArticleScreen component with larger font size for better readability.",
      },
    },
  },
};

export const MobileView: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
    docs: {
      description: {
        story: "ArticleScreen component viewed on mobile device.",
      },
    },
  },
};

export const TabletView: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "ArticleScreen component viewed on tablet device.",
      },
    },
  },
};

export const DesktopView: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "desktop",
    },
    docs: {
      description: {
        story: "ArticleScreen component viewed on desktop device.",
      },
    },
  },
};
