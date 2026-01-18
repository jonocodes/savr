import { ArrowBack } from "@mui/icons-material";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import DiagnosticsScreen from "~/components/DiagnosticsScreen";

export const Route = createFileRoute("/diagnostics")({
  component: DiagnosticsPage,
  ssr: false,
});

function DiagnosticsPage() {
  const navigate = useNavigate();
  return (
    <>
      <ArrowBack onClick={() => navigate({ to: "/" })} />
      <DiagnosticsScreen />
    </>
  );
}
