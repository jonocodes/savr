import { createFileRoute } from "@tanstack/react-router";
import ArticleScreen from "../components/ArticleScreen";

export const Route = createFileRoute("/article/$slug")({
  component: ArticleScreen,
  ssr: false,
});
