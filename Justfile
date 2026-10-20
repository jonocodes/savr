# Common commands. App recipes delegate to package.json scripts (the source of
# truth for how the app builds and tests); the rest are commands that otherwise
# lived only in CI or in READMEs. `just ci` runs what the unit-tests CI job runs.

default:
    @just --list

# Vite dev server (debug on)
dev:
    npm run dev

build:
    npm run build

lint:
    npm run lint

typecheck:
    npx tsc --noEmit

# Jest unit tests
test *args:
    npm test -- {{args}}

# Playwright e2e via scripts/run-e2e.js (per-worktree ports); pass spec paths to narrow
e2e *args:
    npm run test:e2e -- {{args}}

# CORS proxy and stats workers (node --test)
test-workers:
    node --test infra/cors-worker/*.test.mjs infra/cors-stats/*.test.mjs

test-extension:
    node --test scripts/extension-release.test.mjs

# AMO's rules for unlisted (self-hosted) Firefox add-ons
lint-extension:
    npx --yes web-ext@10 lint --self-hosted --source-dir browser-extension

# Everything the unit-tests CI job runs, in the same order
ci: lint typecheck test test-workers test-extension lint-extension

# Deploy your own token-locked CORS proxy worker (Cloudflare auth required)
deploy-proxy:
    cd infra/cors-worker && npx wrangler deploy --env=""

# Deploy the SHARED public proxy instance (maintainers only)
deploy-proxy-public:
    cd infra/cors-worker && npx wrangler deploy --env public

# Self-hosted CORS proxy (Node shell) on :8787; PROXY_TOKENS from .env
proxy-up:
    docker compose up -d --build cors-proxy
