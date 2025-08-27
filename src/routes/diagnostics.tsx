import { createFileRoute } from "@tanstack/react-router";
import DiagnosticsScreen from "~/components/DiagnosticsScreen";

export const Route = createFileRoute("/diagnostics")({
  component: DiagnosticsScreen,
});
