import React from "react";
import DOMPurify from "dompurify";
import { Box, Container, useTheme } from "@mui/material";

interface ArticleComponentProps {
  html: string;
  fontSize: number;
  fontFamily?: string;
}

const ArticleComponent: React.FC<ArticleComponentProps> = ({ html, fontSize, fontFamily }) => {
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
      }}
    >
      <Box
        sx={{
          fontSize: fontSize,
          fontFamily: fontFamily,
          color: "text.primary",
          "& h1": { textAlign: "center" },
          "& #savr-metadata": { textAlign: "center" },
          "& a": {
            color: "primary.main",
          },
          "& code": {
            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : undefined,
          },
          "& pre code": {
            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : undefined,
          },
          "& blockquote": {
            borderLeftColor: isDark ? "rgba(255,255,255,0.3)" : undefined,
          },
          "& th, & td": {
            borderColor: isDark ? "rgba(255,255,255,0.2)" : undefined,
          },
          "& th": {
            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : undefined,
          },
        }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { ADD_TAGS: ["link"], ADD_ATTR: ["rel", "href"] }) }}
      />
    </Container>
  );
};

export default ArticleComponent;
