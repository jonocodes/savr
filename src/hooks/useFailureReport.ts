import { useCallback, useState } from "react";
import { errorMessage } from "~/utils/logging";
import {
  buildFailureReportPayload,
  isFailureReportConfigured,
  type FailureReportPayload,
} from "~/utils/failureReport";

/**
 * State for the "Report this failed article?" dialog. Call `reportFailure` from
 * a failed URL ingest catch block; render the dialog when `pending` is set.
 * A no-op when the build has no failure-report repo configured.
 */
export function useFailureReport() {
  const [pending, setPending] = useState<FailureReportPayload | null>(null);

  const reportFailure = useCallback(
    (url: string, error: unknown, message: string) => {
      if (!isFailureReportConfigured()) return;
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
