import { createFileRoute } from "@tanstack/react-router";
import ArticleListScreen from "~/components/ArticleList";

// const theme = createTheme({
//   palette: {
//     mode: "light",
//     primary: {
//       main: "#1976d2",
//     },
//   },
// });

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <ArticleListScreen />;
}
