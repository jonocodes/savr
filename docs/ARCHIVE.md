# Archived work

Superseded or abandoned work is kept as `archive/*` git tags rather than
branches. Restore one with `git checkout -b <name> <tag>`.

| Tag | What | Why archived |
|---|---|---|
| `archive/failure-report-v1` | First implementation of the "Report this failed article" dialog (#71), formerly branch `feature/app-failure-log` (`ec4a07e`) | Superseded by #73, which shipped a different implementation |
| `archive/proxy-failure-logs-v1` | Early CORS-proxy failure diagnostics (proxy URL, hidden-status probe), the last commit on `feature/app-failure-log` (`6cf4f5f`); builds on `archive/failure-report-v1` | Superseded by the proxy-health work in #86 |
