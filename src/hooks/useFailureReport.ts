import { useCallback, useState } from "react";
import { errorMessage } from "~/utils/logging";
import {
  buildFailureReportPayload,
  isFailureReportConfigured,
  type FailureReportPayload,
} from "~/utils/failureReport";
import { proxyHealth } from "~/utils/article/tools";

/**
 * State for the "Report this failed article?" dialog. Call `reportFailure` from
 * a failed URL ingest catch block; render the dialog when `pending` is set.
 * A no-op when the build has no failure-report repo configured, and while the
 * CORS proxy itself is known to be failing: the article isn't at fault then,
 * so a report would only be noise (#86).
 */
export function useFailureReport() {
  const [pending, setPending] = useState<FailureReportPayload | null>(null);

  const reportFailure = useCallback(
    (url: string, error: unknown, message: string) => {
      if (!isFailureReportConfigured() || proxyHealth.getState().problem) return;
      const detail = errorMessage(error);
      setPending(
        buildFailureReportPayload(url, {
          category: "ingest",
          message,
          ...(detail ? { detail } : {}),
        }),
      );
    },
    [],
  );

  const dismissFailureReport = useCallback(() => setPending(null), []);

  return { pendingFailureReport: pending, reportFailure, dismissFailureReport };
}
