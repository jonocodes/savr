/* eslint-disable react-hooks/rules-of-hooks */
// Storybook render functions use hooks but aren't named components - this is expected behavior
import type { Meta, StoryObj } from "@storybook/react-vite";
import ArticleComponent from "./ArticleComponent";
import { useState, useEffect } from "react";
import { withLightTheme, withDarkTheme } from "~/utils/theme";

const simpleHtmlContent = `
<div style="padding: 20px; font-family: Arial, sans-serif;">
  <h1>Test Article</h1>
  <p>This is a simple test article to verify that Storybook is working correctly.</p>
  <p>If you can see this content, the basic setup is working.</p>
  <ul>
    <li>Feature 1: Basic HTML rendering</li>
    <li>Feature 2: Font size control</li>
    <li>Feature 3: Scrollable content</li>
  </ul>
</div>
`;

// Mock HTML content as fallback for filesystem stories
const mockHtmlContent = `
<div id="savr-root">
  <div id="savr-metadata">
mock
</div>
`;

// Component to load and display raw HTML content (used in commented stories below)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RawHtmlComponent: React.FC<{ fontSize: number }> = ({ fontSize }) => {
  const [html, setHtml] = useState(mockHtmlContent);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadRawHtml = async () => {
      try {
        setLoading(true);

        // Fetch from the static file server (served by Storybook/Vite)
        const response = await fetch("/output/dune-part-two/raw.html");

        if (!response.ok) {
          console.warn("Failed to load raw HTML, using fallback");
          return;
        }

        const content = await response.text();

        // Extract the body content from the JSON-like structure
        const bodyMatch = content.match(/body:\s*"([^"]+)"/);
        if (bodyMatch) {
          const htmlContent = bodyMatch[1];
          // .replace(/\\"/g, '"')
          // .replace(/\\n/g, "\n")
          // .replace(/\\t/g, "\t")
          // .replace(/\\/g, ""); // Remove any remaining backslashes
          setHtml(htmlContent);
        } else {
          setHtml(content);
        }
      } catch (error) {
        console.warn("Error loading raw HTML:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRawHtml();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Loading raw HTML content...</p>
      </div>
    );
  }

  return (
    <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
      <div
        style={{
          fontSize: fontSize,
          lineHeight: 1.6,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

// Component to load and display processed HTML content
const ProcessedHtmlComponent: React.FC<{ fontSize: number }> = ({ fontSize }) => {
  const [html, setHtml] = useState(mockHtmlContent);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProcessedHtml = async () => {
      try {
        setLoading(true);

        // Fetch from the static file server (served by Storybook/Vite)
        const response = await fetch("/output/dune-part-two/index.html");

        if (!response.ok) {
          console.warn("Failed to load processed HTML, using fallback");
          return;
        }

        const content = await response.text();

        // Extract the body content from the JSON-like structure
        const bodyMatch = content.match(/body:\s*"([^"]+)"/);
        if (bodyMatch) {
          const htmlContent = bodyMatch[1];
          // .replace(/\\"/g, '"')
          // .replace(/\\n/g, "\n")
          // .replace(/\\t/g, "\t")
          // .replace(/\\/g, ""); // Remove any remaining backslashes
          // setHtml(htmlContent);
          setHtml(`<link rel="stylesheet" href="/static/web.css">${htmlContent}`);
        } else {
          // setHtml(content);
          setHtml(`<link rel="stylesheet" href="/static/web.css">${content}`);
        }
      } catch (error) {
        console.warn("Error loading processed HTML:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProcessedHtml();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Loading processed HTML content...</p>
      </div>
    );
  }

  return (
    <div style={{ height: "500px", overflow: "auto", padding: "20px" }}>
      <ArticleComponent html={html} fontSize={fontSize} />
    </div>
  );
};

// Using imported theme decorators from ~/utils/theme

const meta: Meta<typeof ArticleComponent> = {
  title: "Components/ArticleComponent",
  component: ArticleComponent,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Simple test stories (working)
export const SimpleTest: Story = {
  render: () => (
    <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
      <ArticleComponent html={simpleHtmlContent} fontSize={16} />
    </div>
  ),
  decorators: [withLightTheme],
};

export const LargeFontTest: Story = {
  render: () => (
    <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
      <ArticleComponent html={simpleHtmlContent} fontSize={24} />
    </div>
  ),
  decorators: [withLightTheme],
};

export const InteractiveTest: Story = {
  render: () => {
    const [fontSize, setFontSize] = useState(16);

    return (
      <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
        <div
          style={{
            marginBottom: "20px",
            position: "sticky",
            top: 0,
            backgroundColor: "white",
            zIndex: 1,
            padding: "10px 0",
          }}
        >
          <label htmlFor="testFontSize">Font Size: </label>
          <input
            id="testFontSize"
            type="range"
            min="12"
            max="24"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ marginLeft: "10px" }}
          />
          <span style={{ marginLeft: "10px" }}>{fontSize}px</span>
        </div>
        <ArticleComponent html={simpleHtmlContent} fontSize={fontSize} />
      </div>
    );
  },
  decorators: [withLightTheme],
};

export const Default: Story = {
  render: () => <ProcessedHtmlComponent fontSize={16} />,
  decorators: [withLightTheme],
};

export const LargeFont: Story = {
  render: () => <ProcessedHtmlComponent fontSize={20} />,
  decorators: [withLightTheme],
};

export const SmallFont: Story = {
  render: () => <ProcessedHtmlComponent fontSize={12} />,
  decorators: [withLightTheme],
};

export const MobileView: Story = {
  render: () => (
    <div
      style={{ maxWidth: "450px", margin: "0 auto", border: "1px solid black", height: "600px" }}
    >
      <ProcessedHtmlComponent fontSize={14} />
    </div>
  ),
  decorators: [withLightTheme],
};

export const Interactive: Story = {
  render: () => {
    const [fontSize, setFontSize] = useState(16);
    const [html, setHtml] = useState(mockHtmlContent);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      const loadContent = async () => {
        try {
          setLoading(true);
          const response = await fetch("/output/dune-part-two/index.html");
          if (!response.ok) {
            console.warn("Failed to load content, using fallback");
            return;
          }
          const content = await response.text();

          // Extract the body content from the JSON-like structure
          const bodyMatch = content.match(/body:\s*"([^"]+)"/);
          if (bodyMatch) {
            const htmlContent = bodyMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "\n")
              .replace(/\\t/g, "\t")
              .replace(/\\/g, ""); // Remove any remaining backslashes
            setHtml(htmlContent);
          } else {
            setHtml(content);
          }
        } catch (error) {
          console.warn("Error loading content:", error);
        } finally {
          setLoading(false);
        }
      };
      loadContent();
    }, []);

    if (loading) {
      return (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <p>Loading content...</p>
        </div>
      );
    }

    return (
      <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
        <div
          style={{
            marginBottom: "20px",
            position: "sticky",
            top: 0,
            backgroundColor: "white",
            zIndex: 1,
            padding: "10px 0",
          }}
        >
          <label htmlFor="fontSize">Font Size: </label>
          <input
            id="fontSize"
            type="range"
            min="12"
            max="24"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ marginLeft: "10px" }}
          />
          <span style={{ marginLeft: "10px" }}>{fontSize}px</span>
        </div>
        <ArticleComponent html={html} fontSize={fontSize} />
      </div>
    );
  },
  decorators: [withLightTheme],
};

// Dark mode stories
export const DarkMode: Story = {
  render: () => <ProcessedHtmlComponent fontSize={16} />,
  decorators: [withDarkTheme],
  parameters: {
    docs: {
      description: {
        story: "Article component with dark theme applied.",
      },
    },
  },
};

export const DarkModeLargeFont: Story = {
  render: () => <ProcessedHtmlComponent fontSize={20} />,
  decorators: [withDarkTheme],
  parameters: {
    docs: {
      description: {
        story: "Article component with dark theme and large font size.",
      },
    },
  },
};

export const DarkModeInteractive: Story = {
  render: () => {
    const [fontSize, setFontSize] = useState(16);
    const [html, setHtml] = useState(mockHtmlContent);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      const loadContent = async () => {
        try {
          setLoading(true);
          const response = await fetch("/output/dune-part-two/index.html");
          if (!response.ok) {
            console.warn("Failed to load content, using fallback");
            return;
          }
          const content = await response.text();

          // Extract the body content from the JSON-like structure
          const bodyMatch = content.match(/body:\s*"([^"]+)"/);
          if (bodyMatch) {
            const htmlContent = bodyMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "\n")
              .replace(/\\t/g, "\t")
              .replace(/\\/g, ""); // Remove any remaining backslashes
            setHtml(htmlContent);
          } else {
            setHtml(content);
          }
        } catch (error) {
          console.warn("Error loading content:", error);
        } finally {
          setLoading(false);
        }
      };
      loadContent();
    }, []);

    if (loading) {
      return (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <p>Loading content...</p>
        </div>
      );
    }

    return (
      <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
        <div
          style={{
            marginBottom: "20px",
            position: "sticky",
            top: 0,
            backgroundColor: "var(--mui-palette-background-paper)",
            zIndex: 1,
            padding: "10px 0",
          }}
        >
          <label htmlFor="darkFontSize">Font Size: </label>
          <input
            id="darkFontSize"
            type="range"
            min="12"
            max="24"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ marginLeft: "10px" }}
          />
          <span style={{ marginLeft: "10px" }}>{fontSize}px</span>
        </div>
        <ArticleComponent html={html} fontSize={fontSize} />
      </div>
    );
  },
  decorators: [withDarkTheme],
  parameters: {
    docs: {
      description: {
        story: "Interactive article component with dark theme and adjustable font size.",
      },
    },
  },
};

// TODO: get these to work. they are causing storybook to crash.

// // Raw HTML stories
// export const RawHtml: Story = {
//   render: () => <RawHtmlComponent fontSize={16} />,
//   parameters: {
//     docs: {
//       description: {
//         story:
//           "Displays the original Wikipedia HTML content with all original styling, navigation, and structure preserved.",
//       },
//     },
//   },
// };

// export const RawHtmlLargeFont: Story = {
//   render: () => <RawHtmlComponent fontSize={20} />,
//   parameters: {
//     docs: {
//       description: {
//         story: "Raw HTML content with larger font size for better readability.",
//       },
//     },
//   },
// };

// export const RawHtmlInteractive: Story = {
//   render: () => {
//     const [fontSize, setFontSize] = useState(16);

//     return (
//       <div style={{ height: "80vh", overflow: "auto", padding: "20px" }}>
//         <div
//           style={{
//             marginBottom: "20px",
//             position: "sticky",
//             top: 0,
//             backgroundColor: "white",
//             zIndex: 1,
//             padding: "10px 0",
//           }}
//         >
//           <label htmlFor="rawFontSize">Raw HTML Font Size: </label>
//           <input
//             id="rawFontSize"
//             type="range"
//             min="12"
//             max="24"
//             value={fontSize}
//             onChange={(e) => setFontSize(Number(e.target.value))}
//             style={{ marginLeft: "10px" }}
//           />
//           <span style={{ marginLeft: "10px" }}>{fontSize}px</span>
//         </div>
//         <RawHtmlComponent fontSize={fontSize} />
//       </div>
//     );
//   },
//   parameters: {
//     docs: {
//       description: {
//         story:
//           "Interactive raw HTML content with adjustable font size. Shows the complete Wikipedia page with original styling.",
//       },
//     },
//   },
// };
