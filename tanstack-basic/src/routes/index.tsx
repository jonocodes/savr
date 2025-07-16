import { createFileRoute } from "@tanstack/react-router";
import { Box, Typography, Button, AppBar, Toolbar, Container, Paper } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import ArticleListScreen from "~/components/ArticleList";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
  },
});

export const Route = createFileRoute("/")({
  component: Home,
});

const mockArticles = [
  {
    slug: "sample-article-1",
    title: "Sample Article Title 1",
    url: "https://example.com/article1",
    state: "unread" as const,
    ingestDate: new Date("2024-01-15"),
    description: "This is a sample article description for demonstration purposes.",
  },
  {
    slug: "sample-article-2",
    title: "Sample Article Title 2",
    url: "https://example.com/article2",
    state: "archived" as const,
    ingestDate: new Date("2024-01-10"),
    description: "Another sample article description for demonstration purposes.",
  },
  {
    slug: "sample-article-3",
    title: "Sample Article Title 3",
    url: "https://example.com/article3",
    state: "unread" as const,
    ingestDate: new Date("2024-01-05"),
    description: "Yet another sample article description for demonstration purposes.",
  },
];

function Home() {
  return <ArticleListScreen initialArticles={mockArticles} />;

}
