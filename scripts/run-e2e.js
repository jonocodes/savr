#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const playwrightArgs = process.argv.slice(2);

const DEFAULT_PORT = 3002;
const baseHost = process.env.PW_SERVER ? 'host.docker.internal' : 'localhost';

function canListenOnPort(port) {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim().length === 0;
  } catch {
    return true;
  }
}

function findAvailablePort(startPort) {
  let port = startPort;

  while (!canListenOnPort(port)) {
    port += 1;
  }

  return port;
}

async function main() {
  const selectedPort = findAvailablePort(DEFAULT_PORT);
  const baseURL = `http://${baseHost}:${selectedPort}`;

  console.log(`Using Playwright base URL: ${baseURL}`);
  console.log(`Starting Playwright with args: ${playwrightArgs.length > 0 ? playwrightArgs.join(' ') : '(full suite)'}`);

  const playwright = spawn('npx', ['playwright', 'test', ...playwrightArgs], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_WEB_SERVER_PORT: String(selectedPort),
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
