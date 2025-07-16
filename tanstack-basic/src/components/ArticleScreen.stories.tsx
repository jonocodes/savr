import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleScreen from "./ArticleScreen";
import React from "react";

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
