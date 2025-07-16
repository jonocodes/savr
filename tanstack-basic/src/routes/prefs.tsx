import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import type { User } from "../utils/users";
import PreferencesScreen from "~/components/PreferenceScreen";

export const Route = createFileRoute("/prefs")({
  loader: async () => {
    const data = "ok";

    return data;
  },
  component: UsersComponent,
});

function UsersComponent() {
  return <PreferencesScreen />;
}
