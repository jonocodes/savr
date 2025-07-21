import { createFileRoute } from "@tanstack/react-router";
import ArticleListScreen from "~/components/ArticleList";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <ArticleListScreen />;
}
