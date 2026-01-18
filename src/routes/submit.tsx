import { createFileRoute } from "@tanstack/react-router";
import SubmitScreen from "~/components/SubmitScreen";

export const Route = createFileRoute("/submit")({
  component: SubmitScreen,
  ssr: false,
});
