# Architecture Decision Records

One file per decision that is expensive to reverse or likely to be re-litigated. The audience is a future maintainer (human or agent) asking *why is it like this* — not a session log.

- **Format:** Nygard-style — Context / Decision / Consequences, with a `Status` line.
- **Naming:** `NNNN-kebab-title.md`. Numbers are never reused or renumbered. To change a decision, add a new ADR and set the old one's status to `Superseded by NNNN` (don't rewrite history).
- **Bar:** architecturally significant — a constraint, contract, or interface that other work must respect. Not for volatile facts (versions, deploy commands — those live in READMEs/runbooks) and not for per-branch session reasoning (that lives in `docs/branch-memory/`).

| ADR | Decision |
| --- | --- |
| [0001](0001-locked-proxy-token-auth.md) | Locked proxies authenticate with a path or query token |
| [0002](0002-unconfigured-proxy-fails-closed.md) | An unconfigured proxy serves a setup page and never proxies |
| [0003](0003-portable-proxy-core.md) | One portable proxy core, thin platform entries |
| [0004](0004-proxy-token-is-a-secret.md) | The proxy token is a secret the app must not leak |
