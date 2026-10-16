import React from "react";
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

export default function CorsTestScreen() {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t("common.corsTestPage")}
      </Typography>
      <Box
        sx={{
          width: "100%",
          height: "calc(100vh - 100px)",
          border: 1,
          borderColor: "divider",
        }}
      >
        <iframe
          src="https://github.com/jonocodes/savr"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title={t("common.corsTestIframeTitle")}
        />
      </Box>
    </Box>
  );
}
