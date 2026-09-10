#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const playwrightArgs = process.argv.slice(2);

const baseHost = process.env.PW_SERVER ? 'host.docker.internal' : 'localhost';

// Derive a deterministic, per-worktree port set from the project root path.
// Git worktrees live in different directories, so each worktree gets a stable
// set of non-overlapping ports (app / remote-storage / content server). This
// lets several worktrees run the e2e suite concurrently without colliding or
// killing each other's servers.
function hashWorktree(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildPorts() {
  const wt = hashWorktree(projectRoot);
  // Bands are disjoint so the three ports never collide with each other.
  return {
    app: 3002 + (wt % 200),       // 3002..3201
    storage: 7606 + (wt % 900),   // 7606..8505
    content: 9080 + (wt % 900),   // 9080..9979
  };
}

async function main() {
  const ports = buildPorts();
  const baseURL = `http://${baseHost}:${ports.app}`;

  console.log(`Using Playwright base URL: ${baseURL}`);
  console.log(`Ports (app/storage/content): ${ports.app}/${ports.storage}/${ports.content}`);
  console.log(`Starting Playwright with args: ${playwrightArgs.length > 0 ? playwrightArgs.join(' ') : '(full suite)'}`);

  const playwright = spawn('npx', ['playwright', 'test', ...playwrightArgs], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_WEB_SERVER_PORT: String(ports.app),
      STORAGE_PORT: String(ports.storage),
      CONTENT_SERVER_PORT: String(ports.content),
    },
    stdio: 'inherit',
    cwd: projectRoot,
  });

  playwright.on('close', (code) => {
    process.exit(code ?? 1);
  });

  process.on('SIGINT', () => {
    playwright.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    playwright.kill('SIGTERM');
  });
}

main().catch((error) => {
  console.error('❌ Failed to start Playwright:', error);
  process.exit(1);
});
