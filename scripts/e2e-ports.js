import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export function buildPorts(root = projectRoot) {
  const wt = hashWorktree(root);
  // Bands are disjoint so the three ports never collide with each other.
  return {
    app: 3002 + (wt % 200),       // 3002..3201
    storage: 7606 + (wt % 900),   // 7606..8505
    content: 9080 + (wt % 900),   // 9080..9979
  };
}
