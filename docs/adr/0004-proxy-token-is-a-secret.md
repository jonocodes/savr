# 0004. The proxy token is a secret the app must not leak

*Status: Accepted · 2026-10-13*

## Context

The proxy setting used to be stored in the `savr-cors-proxy` cookie, so a self-hosted token was sent to Savr's own host on every request and appeared in the Diagnostics cookie dump. Diagnostics, the app log, and failure reports are routinely copied into chats and public GitHub issues. Saved articles must not re-contact the proxy when read.

## Decision

- The proxy setting lives in **localStorage**; a legacy cookie value is migrated and the cookie deleted at startup.
- The configured token — a UUID path segment or a `token=` query value — is **masked** everywhere it could surface: `recordLog` (message and nested meta, at write time), failure-report payloads, and Diagnostics dumps.
- `buildProxiedUrl` is the only place a proxied URL is constructed, and proxied URLs are never persisted into saved article HTML, metadata, or the public export.

## Consequences

- The token only ever travels to the proxy itself, not to Savr's host.
- Masking is shape-based: a custom non-UUID path token is not masked. Extend `tokenCandidates` in `src/utils/net/corsProxy.ts` if custom token formats become common.
- The default public proxy has no token, so masking is a no-op for most users.
- Any new diagnostic surface (a dump, a report, an export) must be checked against this decision rather than assuming the existing maskers cover it.
