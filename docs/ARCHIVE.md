# Archived work

Superseded or abandoned work is kept as `archive/*` git tags rather than
branches. Restore one with `git checkout -b <name> <tag>`.

| Tag | What | Why archived |
|---|---|---|
| `archive/failure-report-v1` | First implementation of the "Report this failed article" dialog (#71), formerly branch `feature/app-failure-log` (`ec4a07e`) | Superseded by #73, which shipped a different implementation |
| `archive/proxy-failure-logs-v1` | Early CORS-proxy failure diagnostics (proxy URL, hidden-status probe), the last commit on `feature/app-failure-log` (`6cf4f5f`); builds on `archive/failure-report-v1` | Superseded by the proxy-health work in #86 |
| `archive/text-browser-tui-v1` | The original local-folder Savr (`4614603`): data in `$SAVR_DATA`, synced by Syncthing; `web/src/server.ts` served pages built for text browsers and `npm run ui` opened them in lynx (`web/tui.sh` lists browsh, carbonyl, links2 as alternatives). A later `cli/` port with a `--ui` lynx launcher lived until `7547705` (last at `03c15b3`); README TUI section and screenshots until `db581c4` | Replaced by the remoteStorage/Dropbox/Google Drive design (no local server). Prior art for #128 / #129 |
