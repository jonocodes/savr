import React, { useMemo } from "react";
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

  // React 19 diffs dangerouslySetInnerHTML by object identity, not by the
  // __html string (React <=18 compared the string). A fresh `{ __html }`
  // literal therefore makes React re-assign innerHTML on EVERY re-render,
  // tearing down and rebuilding the whole article. Harmless-looking for text,
  // but every <img> is recreated and has to decode again — so the article
  // momentarily collapses and the page jumps under the reader. That fired on
  // each debounced reading-progress save, about a second after scrolling
  // stopped. Memoizing keeps the identity stable so React leaves the DOM alone.
  const sanitized = useMemo(
    () => ({
      __html: DOMPurify.sanitize(html, { ADD_TAGS: ["link"], ADD_ATTR: ["rel", "href"] }),
    }),
    [html]
  );

  return (
    <Container
      maxWidth="md"
      data-testid="article-content"
      sx={{
        mt: 1,
        mb: 4,
        p: "12px",
        "--savr-font-family": fontFamily ?? "Georgia, 'Times New Roman', Times, serif",
      } as React.CSSProperties}
    >
      <Box
        sx={{
          fontSize: fontSize,
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
        dangerouslySetInnerHTML={sanitized}
      />
    </Container>
  );
};

export default ArticleComponent;
