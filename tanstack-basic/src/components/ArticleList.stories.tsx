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
    // Add any props that could be controlled if the component accepted them
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
      // Mock empty articles for this story
      const EmptyArticleList = () => {
        const [articles] = React.useState<any[]>([]);
        const [filter, setFilter] = React.useState<"unread" | "archived">("unread");
        const [dialogVisible, setDialogVisible] = React.useState(false);
        const [url, setUrl] = React.useState<string>("");
        const [ingestPercent, setIngestPercent] = React.useState<number>(0);
        const [ingestStatus, setIngestStatus] = React.useState<string | null>(null);

        const theme = React.useMemo(
          () => ({
            palette: {
              mode: "light" as const,
              primary: {
                main: "#1976d2",
              },
              secondary: {
                main: "#dc004e",
              },
            },
          }),
          []
        );

        const filteredArticles = articles.filter((article) => article.state === filter);

        const saveUrl = async () => {
          setIngestPercent(0);
          setIngestStatus("Starting ingestion...");

          const interval = setInterval(() => {
            setIngestPercent((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                  setDialogVisible(false);
                  setIngestPercent(0);
                  setIngestStatus(null);
                }, 1000);
                return 100;
              }
              return prev + 10;
            });
          }, 200);

          setIngestStatus("Processing article...");
        };

        return (
          <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div
              style={{
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                borderBottom: "1px solid #e0e0e0",
                backgroundColor: "#fff",
              }}
            >
              <button
                onClick={() => {
                  setDialogVisible(true);
                  setUrl("https://example.com/article");
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ➕
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setFilter("unread")}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: filter === "unread" ? "#1976d2" : "transparent",
                    color: filter === "unread" ? "white" : "#1976d2",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📄 Saves
                </button>
                <button
                  onClick={() => setFilter("archived")}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: filter === "archived" ? "#1976d2" : "transparent",
                    color: filter === "archived" ? "white" : "#1976d2",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📦 Archive
                </button>
              </div>

              <div style={{ flexGrow: 1 }} />

              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ⚙️
              </button>
            </div>

            {/* Content */}
            <div
              style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}
            >
              <div style={{ textAlign: "center" }}>
                <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>Welcome to Savr</h1>
                <p style={{ fontSize: "16px", color: "#666", marginBottom: "24px" }}>
                  {filter === "unread"
                    ? "Start saving articles to see them here"
                    : "No archived articles yet"}
                </p>
                <button
                  onClick={() => {
                    setDialogVisible(true);
                    setUrl("https://example.com/article");
                  }}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#1976d2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "16px",
                  }}
                >
                  Add Your First Article
                </button>
              </div>
            </div>

            {/* Dialog */}
            {dialogVisible && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    backgroundColor: "white",
                    padding: "24px",
                    borderRadius: "8px",
                    width: "500px",
                    maxWidth: "90%",
                  }}
                >
                  <h2 style={{ marginBottom: "20px" }}>Add Article</h2>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="URL"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      marginBottom: "20px",
                    }}
                  />

                  {ingestPercent > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <p style={{ marginBottom: "8px", color: "#666" }}>{ingestStatus}</p>
                      <div
                        style={{
                          width: "100%",
                          height: "4px",
                          backgroundColor: "#e0e0e0",
                          borderRadius: "2px",
                        }}
                      >
                        <div
                          style={{
                            width: `${ingestPercent}%`,
                            height: "100%",
                            backgroundColor: "#1976d2",
                            borderRadius: "2px",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button
                      onClick={() => setDialogVisible(false)}
                      style={{
                        padding: "8px 16px",
                        border: "1px solid #ccc",
                        backgroundColor: "white",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveUrl}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#1976d2",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      };

      return <EmptyArticleList />;
    },
  ],
};

export const ArchivedOnly: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "ArticleList showing only archived articles.",
      },
    },
  },
  decorators: [
    (Story) => {
      // Mock archived articles for this story
      const ArchivedArticleList = () => {
        const [articles] = React.useState([
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
        ]);
        const [filter, setFilter] = React.useState<"unread" | "archived">("archived");
        const [dialogVisible, setDialogVisible] = React.useState(false);
        const [url, setUrl] = React.useState<string>("");
        const [ingestPercent, setIngestPercent] = React.useState<number>(0);
        const [ingestStatus, setIngestStatus] = React.useState<string | null>(null);

        const filteredArticles = articles.filter((article) => article.state === filter);

        const saveUrl = async () => {
          setIngestPercent(0);
          setIngestStatus("Starting ingestion...");

          const interval = setInterval(() => {
            setIngestPercent((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                  setDialogVisible(false);
                  setIngestPercent(0);
                  setIngestStatus(null);
                }, 1000);
                return 100;
              }
              return prev + 10;
            });
          }, 200);

          setIngestStatus("Processing article...");
        };

        return (
          <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div
              style={{
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                borderBottom: "1px solid #e0e0e0",
                backgroundColor: "#fff",
              }}
            >
              <button
                onClick={() => {
                  setDialogVisible(true);
                  setUrl("https://example.com/article");
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ➕
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setFilter("unread")}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: filter === "unread" ? "#1976d2" : "transparent",
                    color: filter === "unread" ? "white" : "#1976d2",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📄 Saves
                </button>
                <button
                  onClick={() => setFilter("archived")}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: filter === "archived" ? "#1976d2" : "transparent",
                    color: filter === "archived" ? "white" : "#1976d2",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📦 Archive
                </button>
              </div>

              <div style={{ flexGrow: 1 }} />

              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ⚙️
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: "16px" }}>
              <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "4px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  {filteredArticles.map((item) => (
                    <div
                      key={item.slug}
                      style={{
                        padding: "16px",
                        borderBottom: "1px solid #e0e0e0",
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          backgroundColor: "#e0e0e0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        📄
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{item.title}</h3>
                        <p style={{ margin: "0 0 4px 0", fontSize: "14px", color: "#666" }}>
                          {item.description}
                        </p>
                        <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>
                          {item.ingestDate.toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "8px",
                        }}
                      >
                        ⋮
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dialog */}
            {dialogVisible && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    backgroundColor: "white",
                    padding: "24px",
                    borderRadius: "8px",
                    width: "500px",
                    maxWidth: "90%",
                  }}
                >
                  <h2 style={{ marginBottom: "20px" }}>Add Article</h2>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="URL"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      marginBottom: "20px",
                    }}
                  />

                  {ingestPercent > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <p style={{ marginBottom: "8px", color: "#666" }}>{ingestStatus}</p>
                      <div
                        style={{
                          width: "100%",
                          height: "4px",
                          backgroundColor: "#e0e0e0",
                          borderRadius: "2px",
                        }}
                      >
                        <div
                          style={{
                            width: `${ingestPercent}%`,
                            height: "100%",
                            backgroundColor: "#1976d2",
                            borderRadius: "2px",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button
                      onClick={() => setDialogVisible(false)}
                      style={{
                        padding: "8px 16px",
                        border: "1px solid #ccc",
                        backgroundColor: "white",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveUrl}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#1976d2",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      };

      return <ArchivedArticleList />;
    },
  ],
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
};

export const TabletView: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "tablet",
    },
    docs: {
      description: {
        story: "ArticleList component viewed on tablet device.",
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
        story: "ArticleList component viewed on desktop device.",
      },
    },
  },
};

export const WithDialogOpen: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "ArticleList with the add article dialog open.",
      },
    },
  },
  decorators: [
    (Story) => {
      const WithDialogOpenArticleList = () => {
        const [dialogVisible] = React.useState(true);
        const [url, setUrl] = React.useState("https://example.com/sample-article");
        const [ingestPercent, setIngestPercent] = React.useState<number>(0);
        const [ingestStatus, setIngestStatus] = React.useState<string | null>(null);

        const saveUrl = async () => {
          setIngestPercent(0);
          setIngestStatus("Starting ingestion...");

          const interval = setInterval(() => {
            setIngestPercent((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                  setIngestPercent(0);
                  setIngestStatus(null);
                }, 1000);
                return 100;
              }
              return prev + 10;
            });
          }, 200);

          setIngestStatus("Processing article...");
        };

        return (
          <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div
              style={{
                padding: "16px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                borderBottom: "1px solid #e0e0e0",
                backgroundColor: "#fff",
              }}
            >
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ➕
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: "#1976d2",
                    color: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📄 Saves
                </button>
                <button
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #1976d2",
                    backgroundColor: "transparent",
                    color: "#1976d2",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📦 Archive
                </button>
              </div>

              <div style={{ flexGrow: 1 }} />

              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                }}
              >
                ⚙️
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: "16px" }}>
              <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "4px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <div
                    style={{
                      padding: "16px",
                      borderBottom: "1px solid #e0e0e0",
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "#e0e0e0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      📄
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>
                        Sample Article Title 1
                      </h3>
                      <p style={{ margin: "0 0 4px 0", fontSize: "14px", color: "#666" }}>
                        This is a sample article description for demonstration purposes.
                      </p>
                      <p style={{ margin: 0, fontSize: "12px", color: "#999" }}>1/15/2024</p>
                    </div>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "8px",
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Dialog */}
            {dialogVisible && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    backgroundColor: "white",
                    padding: "24px",
                    borderRadius: "8px",
                    width: "500px",
                    maxWidth: "90%",
                  }}
                >
                  <h2 style={{ marginBottom: "20px" }}>Add Article</h2>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="URL"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      marginBottom: "20px",
                    }}
                  />

                  {ingestPercent > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <p style={{ marginBottom: "8px", color: "#666" }}>{ingestStatus}</p>
                      <div
                        style={{
                          width: "100%",
                          height: "4px",
                          backgroundColor: "#e0e0e0",
                          borderRadius: "2px",
                        }}
                      >
                        <div
                          style={{
                            width: `${ingestPercent}%`,
                            height: "100%",
                            backgroundColor: "#1976d2",
                            borderRadius: "2px",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <button
                      style={{
                        padding: "8px 16px",
                        border: "1px solid #ccc",
                        backgroundColor: "white",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveUrl}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#1976d2",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      };

      return <WithDialogOpenArticleList />;
    },
  ],
};
