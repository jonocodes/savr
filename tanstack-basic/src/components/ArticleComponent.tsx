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
          // lineHeight: 1.6,
          // "& h1, & h2, & h3, & h4, & h5, & h6": {
          //   marginTop: 2,
          //   marginBottom: 1,
          //   fontWeight: "bold",
          // },
          // "& p": {
          //   marginBottom: 1.5,
          //   textAlign: "justify",
          // },
          // "& table": {
          //   borderCollapse: "collapse",
          //   width: "100%",
          //   marginBottom: 2,
          // },
          // "& th, & td": {
          //   border: "1px solid #ddd",
          //   padding: "8px",
          //   textAlign: "left",
          // },
          // "& th": {
          //   backgroundColor: "#f2f2f2",
          //   fontWeight: "bold",
          // },
          // "& a": {
          //   color: "#1976d2",
          //   textDecoration: "none",
          // },
          // "& a:hover": {
          //   textDecoration: "underline",
          // },
          // "& img": {
          //   maxWidth: "100%",
          //   height: "auto",
          //   marginBottom: 1,
          // },
          // "& ul, & ol": {
          //   marginBottom: 1.5,
          //   paddingLeft: 2,
          // },
          // "& li": {
          //   marginBottom: 0.5,
          // },
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Container>
  );
};

export default ArticleComponent;
