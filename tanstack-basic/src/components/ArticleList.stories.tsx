import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleListScreen from "./ArticleList";
import React from "react";

const meta: Meta<typeof ArticleListScreen> = {
  title: "Components/ArticleList",
  component: ArticleListScreen,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A comprehensive article list component built with Material-UI. Features include article filtering, archive/unarchive functionality, article sharing, and a dialog for adding new articles.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    initialArticles: {
      control: false,
      description: "Initial articles to display (for Storybook stories)",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Default ArticleList with sample articles showing both unread and archived items.",
      },
    },
  },
};

export const EmptyState: Story = {
  args: {
    initialArticles: [],
  },
  parameters: {
    docs: {
      description: {
        story: "ArticleList showing empty state when no articles are available.",
      },
    },
  },
};

export const ArchivedOnly: Story = {
  args: {
    initialArticles: [
      {
        slug: "archived-article-1",
        title: "Archived Article 1",
        url: "https://example.com/archived1",
        state: "archived" as const,
        ingestDate: new Date("2024-01-15"),
        description: "This is an archived article.",
      },
      {
        slug: "archived-article-2",
        title: "Archived Article 2",
        url: "https://example.com/archived2",
        state: "archived" as const,
        ingestDate: new Date("2024-01-10"),
        description: "Another archived article.",
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: "ArticleList showing only archived articles.",
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
        story: "ArticleList component viewed on mobile device.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "600px", margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
};
