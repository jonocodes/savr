import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import PreferencesScreen from "~/components/PreferenceScreen";
import SubmitScreen from "~/components/SubmitScreen";

export const Route = createFileRoute("/submit")({
  component: SubmitScreen,
  ssr: false,
});
