import { spawn, ChildProcess } from "child_process";
import { FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

let armadettoProcess: ChildProcess | null = null;
let contentServerProcess: ChildProcess | null = null;

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
    } catch (err) {
      // Server not responding yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

export default async function globalSetup(config: FullConfig) {
  console.log("\n🚀 Starting test servers...\n");

  // Start Armadietto RemoteStorage server
  console.log("Starting Armadietto RemoteStorage server...");
  armadettoProcess = spawn("node", ["armadietto.cjs"], {
    cwd: path.join(process.cwd(), "test-server"),
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test", // Signals to armadietto.cjs to use port 8006
      STORAGE_PORT: "8006", // Explicitly set storage port
    },
  });

  // Capture token from stdout
  let token = "";
  let serverStarted = false;

  armadettoProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log("[Armadietto]", output.trim());

    // Parse token: "Token:      <token>"
    const tokenMatch = output.match(/Token:\s+(.+)/);
    if (tokenMatch) {
      token = tokenMatch[1].trim();
      console.log("✅ Captured OAuth token");
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
        `Server started: ${serverStarted}, Token captured: ${!!token}`
    );
  }

  if (!token) {
    throw new Error("Failed to capture OAuth token from Armadietto");
  }

  // Start content server for test data
  console.log("Starting content server...");
  contentServerProcess = spawn("npm", ["run", "demo-server3"], {
    stdio: "pipe",
  });

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

  // Store token for tests
  const testEnv = { RS_TOKEN: token };
  const testEnvPath = path.join(process.cwd(), "tests/e2e/.test-env.json");
  fs.writeFileSync(testEnvPath, JSON.stringify(testEnv, null, 2));
  console.log("✅ Test environment saved\n");
  console.log("🎬 All servers ready! Starting tests...\n");

  // Return teardown function
  return async () => {
    console.log("\n🧹 Cleaning up test servers...\n");

    if (armadettoProcess) {
      console.log("Stopping Armadietto server...");
      armadettoProcess.kill("SIGTERM");
      // Give it a moment to clean up
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Force kill if still running
      if (!armadettoProcess.killed) {
        armadettoProcess.kill("SIGKILL");
      }
      console.log("✅ Armadietto server stopped");
    }

    if (contentServerProcess) {
      console.log("Stopping content server...");
      contentServerProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!contentServerProcess.killed) {
        contentServerProcess.kill("SIGKILL");
      }
      console.log("✅ Content server stopped");
    }

    console.log("✅ Cleanup complete\n");
  };
}
