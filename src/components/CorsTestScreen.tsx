import React from "react";
import { Box, Typography } from "@mui/material";

export default function CorsTestScreen() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        CORS Test Page
      </Typography>
      <Box
        sx={{
          width: "100%",
          height: "calc(100vh - 100px)",
          border: "1px solid #ccc",
        }}
      >
        <iframe
          src="https://github.com/jonocodes/savr"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title="Savr GitHub Repository"
        />
      </Box>
    </Box>
  );
}
