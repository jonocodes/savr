import { createFileRoute } from "@tanstack/react-router";
import PreferencesScreen from "~/components/PreferenceScreen";

export const Route = createFileRoute("/prefs")({
  loader: async () => {
    const data = "ok";

    return data;
  },
  component: PreferencesScreen,
  ssr: false,
});
