import { createFileRoute } from "@tanstack/react-router";
import { Box, Typography, Button, AppBar, Toolbar, Container, Paper } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";

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

function Home() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Savr - Article Reader
          </Typography>
          <Button color="inherit">Login</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome to Savr!
          </Typography>
          <Typography variant="body1" paragraph>
            This is a test page to verify that MUI components are working correctly.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => (window.location.href = "/article/sample-article")}
          >
            View Sample Article
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
