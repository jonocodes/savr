import { db, type LogEntry } from "./db";

// Keep the log small enough to stay fast and to avoid filling the user's
// device: oldest entries are pruned once this many are stored.
const MAX_LOG_ENTRIES = 500;

export type LogLevel = LogEntry["level"];

/**
 * Best-effort string for an unknown thrown value, so log meta stays readable.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Record an app-level event (usually a failure) for later inspection on the
 * Diagnostics screen. This is deliberately fire-and-forget and never throws:
 * recording a failure must not cause one.
 */
export function recordLog(
  level: LogLevel,
  category: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  void db
    .transaction("rw", db.logs, async () => {
      await db.logs.add({
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        meta,
      });
      const count = await db.logs.count();
      if (count > MAX_LOG_ENTRIES) {
        const excess = await db.logs
          .orderBy("id")
          .limit(count - MAX_LOG_ENTRIES)
          .toArray();
        await db.logs.bulkDelete(excess.map((entry) => entry.id!));
      }
    })
    .catch(() => {
      // Ignore: logging is diagnostic and must not disrupt the caller.
    });
}

export async function clearLogs(): Promise<void> {
  await db.logs.clear();
}

/**
 * Render log entries as plain text for copy/paste off a mobile device.
 */
export function formatLogsForCopy(logs: LogEntry[]): string {
  return logs
    .map((entry) => {
      const meta =
        entry.meta && Object.keys(entry.meta).length > 0
          ? ` ${JSON.stringify(entry.meta)}`
          : "";
      return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.category}: ${entry.message}${meta}`;
    })
    .join("\n");
}
