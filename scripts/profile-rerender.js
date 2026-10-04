#!/usr/bin/env node

// Profile the re-render a reading-progress save causes, against a production
// React build. See tests/e2e/profile-progress-rerender.spec.ts for the method.
//
//   npm run profile:rerender                 # build, serve, profile at 1x/4x/6x CPU
//   npm run profile:rerender -- --no-build   # reuse the existing dist/
//   npm run profile:rerender -- -g 6x        # extra args go to Playwright
//
// Measuring the dev server instead would overstate the cost several times over
// (dev React is much slower), so this serves `dist/` with `vite preview` on the
// e2e app port, where Playwright's reuseExistingServer picks it up.

import { spawn } from 'node:child_process';
import { buildPorts, projectRoot } from './e2e-ports.js';

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const playwrightArgs = args.filter((a) => a !== '--no-build');

const run = (cmd, cmdArgs, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit', cwd: projectRoot, ...opts });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited with ${code}`))
    );
  });

const isServing = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const { app } = buildPorts();
  const url = `http://localhost:${app}/`;

  // Anything already on the app port (typically a dev server) would be reused
  // by Playwright and silently produce dev-React numbers. Refuse instead.
  if (await isServing(url)) {
    throw new Error(
      `Something is already serving ${url}. Stop it first — the profile must run ` +
        `against the production build, not whatever is listening there.`
    );
  }

  if (!skipBuild) await run('npm', ['run', 'build:dev']);

  // Detached so the whole process group (npx -> vite) can be killed at the end.
  const preview = spawn('npx', ['vite', 'preview', '--port', String(app), '--strictPort'], {
    cwd: projectRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
  let previewExited = false;
  preview.on('exit', () => (previewExited = true));
  const stopPreview = () => {
    if (previewExited) return;
    try {
      process.kill(-preview.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('SIGINT', () => {
    stopPreview();
    process.exit(130);
  });

  try {
    const deadline = Date.now() + 30000;
    while (!(await isServing(url))) {
      if (previewExited) throw new Error('vite preview exited before serving');
      if (Date.now() > deadline) throw new Error(`vite preview did not start on ${url}`);
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`Serving the production build on ${url}\n`);

    // One worker: parallel workers would compete for CPU and skew the timings.
    await run(
      'node',
      [
        'scripts/run-e2e.js',
        'tests/e2e/profile-progress-rerender.spec.ts',
        '--reporter=list',
        '--workers=1',
        ...playwrightArgs,
      ],
      { env: { ...process.env, SAVR_PROFILE: '1' } }
    );
  } finally {
    stopPreview();
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
