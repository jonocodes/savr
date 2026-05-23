import React from "react";
import { Box, Container } from "@mui/material";
import { useTheme } from "@mui/material/styles";

interface ArticleComponentProps {
  html: string;
  fontSize: number;
}

const ArticleComponent: React.FC<ArticleComponentProps> = ({ html, fontSize }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Container
      maxWidth="md"
      data-testid="article-content"
      sx={{
        mt: 1,
        mb: 4,
        p: "12px",
        // paddingTop: "0px",
        // mx: "auto",
        // display: "block",
      }}
    >
      <Box
        sx={{
          fontSize: fontSize,
          // Ensure code/pre blocks respect the active theme regardless of
          // system-level prefers-color-scheme (which web.css media queries
          // can't detect when the user manually picks a theme in-app).
          "& code": {
            backgroundColor: isDark ? "#2d2d2d" : "#f5f5f5",
            color: isDark ? "#e0e0e0" : "#1a1a1a",
          },
          "& pre code": {
            backgroundColor: isDark ? "#1e1e1e" : "#f5f5f5",
            color: isDark ? "#e0e0e0" : "#1a1a1a",
          },
          "& blockquote": {
            borderLeftColor: isDark ? "#555" : "#ccc",
            color: isDark ? "#aaa" : "#666",
          },
          "& th": {
            backgroundColor: isDark ? "#2d2d2d" : "#f5f5f5",
            color: isDark ? "#e0e0e0" : "#1a1a1a",
          },
          "& td, & th": {
            borderColor: isDark ? "#555" : "#ddd",
          },
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Container>
  );
};

export default ArticleComponent;
