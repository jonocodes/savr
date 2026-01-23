import React from "react";
import { Box, Container } from "@mui/material";

interface ArticleComponentProps {
  html: string;
  fontSize: number;
}

const ArticleComponent: React.FC<ArticleComponentProps> = ({ html, fontSize }) => {
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
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Container>
  );
};

export default ArticleComponent;
