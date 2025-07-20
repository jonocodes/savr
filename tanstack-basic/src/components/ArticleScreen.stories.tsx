import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleScreen from "./ArticleScreen";
import ArticleComponent from "./ArticleComponent";
import React, { createContext, useContext, useState, useEffect } from "react";
import { Article } from "../../../lib/src/models";
import { db } from "~/utils/db";

// Fetch article data from filesystem
const fetchArticleData = async (): Promise<Article | null> => {
  try {
    const response = await fetch("/output/dune-part-two/article.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const articleData = await response.json();
    return articleData as Article;
  } catch (error) {
    console.error("Error fetching article data:", error);

    return null;
  }
};

// Mock storage client that fetches HTML content via HTTP
const mockStorageClient = {
  getFile: async (filePath: string) => {
    try {
      // Map the storage path to the HTTP URL
      let url: string;
      if (filePath === "saves/dune-part-two/index.html") {
        url = "/output/dune-part-two/index.html";
      } else if (filePath === "saves/dune-part-two/raw.html") {
        url = "/output/dune-part-two/raw.html";
      } else {
        throw new Error(`File not found: ${filePath}`);
      }

      // Fetch the file content via HTTP
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      // Extract the body content from the JSON-like structure
      const bodyMatch = content.match(/body:\s*"([^"]+)"/);
      if (bodyMatch) {
        return {
          data: bodyMatch[1],
          // .replace(/\\"/g, '"')
          // .replace(/\\n/g, "\n")
          // .replace(/\\t/g, "\t")
          // .replace(/\\/g, ""), // Remove any remaining backslashes
        };
      }

      // If no body match, return the raw content
      return { data: content };
    } catch (error) {
      console.error(`Error fetching file ${filePath}:`, error);
      // Fallback to a simple HTML structure
      return {
        data: `<div id="savr-root">
            error fetching file
        </div>`,
      };
    }
  },
};

// Create a mock RemoteStorage context
const MockRemoteStorageContext = createContext({
  remoteStorage: null,
  client: mockStorageClient,
  widget: null,
});

// Mock RemoteStorageProvider component
const MockRemoteStorageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <MockRemoteStorageContext.Provider
      value={{
        remoteStorage: null,
        client: mockStorageClient,
        widget: null,
      }}
    >
      {children}
    </MockRemoteStorageContext.Provider>
  );
};

// Wrapper component that provides mock context and populates database
const ArticleScreenWithMockData: React.FC = () => {
  // Populate database with fetched article data
  React.useEffect(() => {
    const populateDb = async () => {
      try {
        const articleData = await fetchArticleData();
        await db.articles.clear(); // Clear existing data
        await db.articles.put(articleData!); // Use put instead of add to handle duplicates
        console.log("Database populated with article:", articleData!.slug);
      } catch (error) {
        console.error("Error populating database:", error);
      }
    };
    populateDb();
  }, []);

  return (
    <MockRemoteStorageProvider>
      <div style={{ height: "80vh", overflow: "auto" }}>
        <ArticleScreen />
      </div>
    </MockRemoteStorageProvider>
  );
};

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
  render: () => <ArticleScreenWithMockData />,
  parameters: {
    docs: {
      description: {
        story: "Default ArticleScreen with Dune: Part Two article content and controls.",
      },
    },
  },
};

export const LargeFont: Story = {
  render: () => <ArticleScreenWithMockData />,
  parameters: {
    docs: {
      description: {
        story: "ArticleScreen component with larger font size for better readability.",
      },
    },
  },
};

export const MobileView: Story = {
  render: () => <ArticleScreenWithMockData />,
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
