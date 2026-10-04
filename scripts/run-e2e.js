#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { buildPorts, projectRoot } from './e2e-ports.js';

const playwrightArgs = process.argv.slice(2);

const baseHost = process.env.PW_SERVER ? 'host.docker.internal' : 'localhost';

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
