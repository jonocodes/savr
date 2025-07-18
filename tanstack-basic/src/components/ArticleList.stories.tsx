import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleListScreen from "./ArticleList";
import { Article } from "../../../lib/src/models";
import { db } from "~/utils/db";
import React from "react";

const mockArticles: Article[] = [
  {
    slug: "sample-article-1",
    title: "Sample Article Title 1",
    url: "https://example.com/article1",
    state: "unread",
    ingestDate: "2024-01-15T10:00:00.000Z",
    ingestPlatform: "typescript/web (1.0.0)",
    ingestSource: "manual",
    mimeType: "text/html",
    readTimeMinutes: 5,
    progress: 0,
    publication: "Example Blog",
    author: "John Doe",
    publishedDate: "2024-01-15T09:00:00.000Z",
  },
  {
    slug: "sample-article-2",
    title: "Sample Article Title 2",
    url: "https://example.com/article2",
    state: "archived",
    ingestDate: "2024-01-10T10:00:00.000Z",
    ingestPlatform: "typescript/web (1.0.0)",
    ingestSource: "manual",
    mimeType: "text/html",
    readTimeMinutes: 8,
    progress: 100,
    publication: "Tech News",
    author: "Jane Smith",
    publishedDate: "2024-01-10T09:00:00.000Z",
  },
  {
    slug: "sample-article-3",
    title: "Sample Article Title 3",
    url: "https://example.com/article3",
    state: "unread",
    ingestDate: "2024-01-05T10:00:00.000Z",
    ingestPlatform: "typescript/web (1.0.0)",
    ingestSource: "manual",
    mimeType: "text/html",
    readTimeMinutes: 3,
    progress: 0,
    publication: "Science Daily",
    author: "Bob Johnson",
    publishedDate: "2024-01-05T09:00:00.000Z",
  },
];

const archivedArticles: Article[] = [
  {
    slug: "archived-article-1",
    title: "Archived Article 1",
    url: "https://example.com/archived1",
    state: "archived",
    ingestDate: "2024-01-15T10:00:00.000Z",
    ingestPlatform: "typescript/web (1.0.0)",
    ingestSource: "manual",
    mimeType: "text/html",
    readTimeMinutes: 6,
    progress: 100,
    publication: "Old Blog",
    author: "Alice Brown",
    publishedDate: "2024-01-15T09:00:00.000Z",
  },
  {
    slug: "archived-article-2",
    title: "Archived Article 2",
    url: "https://example.com/archived2",
    state: "archived",
    ingestDate: "2024-01-10T10:00:00.000Z",
    ingestPlatform: "typescript/web (1.0.0)",
    ingestSource: "manual",
    mimeType: "text/html",
    readTimeMinutes: 4,
    progress: 100,
    publication: "News Site",
    author: "Charlie Wilson",
    publishedDate: "2024-01-10T09:00:00.000Z",
  },
];

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
  argTypes: {},
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
  decorators: [
    (Story) => {
      // Populate database with mock articles
      React.useEffect(() => {
        const populateDb = async () => {
          await db.articles.clear(); // Clear existing data
          await db.articles.bulkAdd(mockArticles);
        };
        populateDb();
      }, []);

      return <Story />;
    },
  ],
};

export const EmptyState: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "ArticleList showing empty state when no articles are available.",
      },
    },
  },
  decorators: [
    (Story) => {
      // Clear database to show empty state
      React.useEffect(() => {
        const clearDb = async () => {
          await db.articles.clear();
        };
        clearDb();
      }, []);

      return <Story />;
    },
  ],
};

// export const ArchivedOnly: Story = {
//   args: {},
//   parameters: {
//     docs: {
//       description: {
//         story: "ArticleList showing only archived articles.",
//       },
//     },
//   },
//   decorators: [
//     (Story) => {
//       // Populate database with archived articles only
//       React.useEffect(() => {
//         const populateDb = async () => {
//           await db.articles.clear(); // Clear existing data
//           await db.articles.bulkAdd(archivedArticles);
//         };
//         populateDb();
//       }, []);

//       return <Story />;
//     },
//   ],
// };

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
    (Story) => {
      // Populate database with mock articles
      React.useEffect(() => {
        const populateDb = async () => {
          await db.articles.clear(); // Clear existing data
          await db.articles.bulkAdd(mockArticles);
        };
        populateDb();
      }, []);

      return (
        <div style={{ width: "400px", margin: "0 auto" }}>
          <Story />
        </div>
      );
    },
  ],
};
