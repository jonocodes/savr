import { createFileRoute } from "@tanstack/react-router";
import CorsTestScreen from "~/components/CorsTestScreen";

export const Route = createFileRoute("/corstest")({
  component: CorsTestScreen,
  ssr: false,
});
