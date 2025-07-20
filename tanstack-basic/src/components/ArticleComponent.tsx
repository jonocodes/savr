import React from "react";
import { Box, Container } from "@mui/material";

interface ArticleComponentProps {
  html: string;
  fontSize: number;
}

const ArticleComponent: React.FC<ArticleComponentProps> = ({ html, fontSize }) => {
  return (
    <Container maxWidth="md" sx={{ mt: 2, mb: 4 }}>
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
