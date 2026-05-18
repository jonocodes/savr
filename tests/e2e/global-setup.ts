import { spawn, ChildProcess, execSync } from "child_process";
import { FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

let armadettoProcess: ChildProcess | null = null;
let contentServerProcess: ChildProcess | null = null;

/**
 * Kill any process using the specified port
 */
function killPortProcess(port: number): void {
  try {
    // Use fuser to find and kill processes on the port
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
  } catch {
    // Ignore errors - port might not be in use
  }
}

/**
 * Poll a URL until it responds successfully
 */
async function waitForServer(
  url: string,
  timeoutMs: number = 10000,
  intervalMs: number = 500
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(1000), // 1 second timeout per request
      });
      if (response.ok || response.status === 401) {
        // 401 is OK for Armadietto - means server is up but needs auth
        return;
      }
    } catch {
      // Server not responding yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

export default async function globalSetup(_config: FullConfig) {
  console.log("\n🚀 Starting test servers...\n");

  // Clean up any stale processes from previous runs
  console.log("Cleaning up stale processes...");
  killPortProcess(8006);
  killPortProcess(8080);
  // Give processes time to die
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Start Armadietto RemoteStorage server
  console.log("Starting Armadietto RemoteStorage server...");
  armadettoProcess = spawn("node", ["armadietto.cjs"], {
    cwd: path.join(process.cwd(), "test-server"),
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test", // Signals to armadietto.cjs to use port 8006
      STORAGE_PORT: "8006", // Explicitly set storage port
      MAX_TEST_WORKERS: process.env.CI ? "2" : "4", // Must match workers in playwright.config.ts
    },
  });

  // Capture per-worker tokens from stdout: "Token[N]: <token>"
  const tokens: string[] = [];
  let serverStarted = false;

  armadettoProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log("[Armadietto]", output.trim());

    const tokenMatch = output.match(/Token\[(\d+)\]:\s+(.+)/);
    if (tokenMatch) {
      const idx = parseInt(tokenMatch[1], 10);
      tokens[idx] = tokenMatch[2].trim();
      console.log(`✅ Captured OAuth token for testuser${idx}`);
    }

    if (output.includes("RemoteStorage Test Server Running")) {
      serverStarted = true;
    }
  });

  armadettoProcess.stderr?.on("data", (data) => {
    console.error("[Armadietto Error]", data.toString());
  });

  armadettoProcess.on("error", (err) => {
    throw new Error(`Armadietto process error: ${err.message}`);
  });

  armadettoProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      throw new Error(`Armadietto exited with code ${code}`);
    }
  });

  // Wait a moment for process to start, then verify with health check
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Waiting for Armadietto to respond...");
  try {
    await waitForServer("http://localhost:8006/", 10000);
    console.log("✅ Armadietto server ready on port 8006\n");
  } catch (err) {
    throw new Error(
      `Armadietto server failed to respond: ${err}. ` +
        `Server started: ${serverStarted}, Tokens captured: ${tokens.length}`
    );
  }

  if (tokens.length === 0) {
    throw new Error("Failed to capture any OAuth tokens from Armadietto");
  }

  // Start content server for test data (directly, not via npm, for easier cleanup)
  console.log("Starting content server...");
  contentServerProcess = spawn(
    "npx",
    ["http-server", "test_data/", "-p", "8080", "--cors"],
    {
      stdio: "pipe",
    }
  );

  contentServerProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log("[ContentServer]", output.trim());
  });

  contentServerProcess.stderr?.on("data", (data) => {
    console.error("[ContentServer Error]", data.toString());
  });

  contentServerProcess.on("error", (err) => {
    throw new Error(`Content server process error: ${err.message}`);
  });

  contentServerProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      throw new Error(`Content server exited with code ${code}`);
    }
  });

  // Wait a moment for process to start, then verify with health check
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("Waiting for content server to respond...");
  try {
    await waitForServer("http://localhost:8080/", 10000);
    console.log("✅ Content server ready on port 8080\n");
  } catch (err) {
    throw new Error(`Content server failed to respond: ${err}`);
  }

  // Store tokens and PIDs for tests and teardown.
  // RS_TOKENS[workerIndex] is the token for testuser{workerIndex}.
  // RS_TOKEN is kept as an alias for RS_TOKENS[0] (backward compat).
  const testEnv = {
    RS_TOKEN: tokens[0],
    RS_TOKENS: tokens,
    ARMADIETTO_PID: armadettoProcess?.pid,
    CONTENT_SERVER_PID: contentServerProcess?.pid,
  };
  const testEnvPath = path.join(process.cwd(), "tests/e2e/.test-env.json");
  fs.writeFileSync(testEnvPath, JSON.stringify(testEnv, null, 2));
  console.log("✅ Test environment saved\n");
  console.log("🎬 All servers ready! Starting tests...\n");
}
