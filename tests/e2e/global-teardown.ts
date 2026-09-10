import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * Kill a process by PID, with proper waiting
 */
async function killProcess(pid: number | undefined, name: string): Promise<void> {
  if (!pid) return;

  console.log(`Stopping ${name} (PID: ${pid})...`);
  try {
    // First try SIGTERM for graceful shutdown
    process.kill(pid, "SIGTERM");

    // Wait for process to die
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check if still running and force kill if needed
    try {
      process.kill(pid, 0); // Check if still running (throws if not)
      // Still running, force kill
      process.kill(pid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // Process already dead, which is fine
    }
    console.log(`✅ ${name} stopped`);
  } catch {
    // Process may already be dead
    console.log(`⚠️  ${name} was not running (PID: ${pid})`);
  }
}

/**
 * Kill any process using the specified port (fallback cleanup)
 */
function killPortProcess(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
  } catch {
    // Ignore errors
  }
}

export default async function globalTeardown() {
  console.log("\n🧹 Running global teardown...\n");

  // Read PIDs from test env file and kill servers
  const testEnvPath = path.join(process.cwd(), "tests/e2e/.test-env.json");
  if (fs.existsSync(testEnvPath)) {
    try {
      const testEnv = JSON.parse(fs.readFileSync(testEnvPath, "utf-8"));
      await killProcess(testEnv.ARMADIETTO_PID, "Armadietto server");
      await killProcess(testEnv.CONTENT_SERVER_PID, "Content server");
    } catch (err) {
      console.warn("⚠️  Failed to read test env for cleanup:", err);
    }
  }

  // Fallback: kill any remaining processes on our ports (same source as
  // global-setup: set by run-e2e.js, falls back to the historical fixed ports).
  const storagePort = Number(process.env.STORAGE_PORT) || 8006;
  const contentPort = Number(process.env.CONTENT_SERVER_PORT) || 8080;
  killPortProcess(storagePort);
  killPortProcess(contentPort);

  // Clean up temp storage directory (keyed off the storage port).
  const storagePath = `/tmp/restore${storagePort}`;
  if (fs.existsSync(storagePath)) {
    console.log("Cleaning up RemoteStorage temp data...");
    console.log("storagePath", storagePath);
    // list the contents of the directory
    const contents = fs.readdirSync(storagePath);
    console.log("contents", contents);
    // list the contents of the directory recursively
    const contentsRecursive = fs.readdirSync(storagePath, { recursive: true });
    console.log("contentsRecursive", contentsRecursive);
    try {
      fs.rmSync(storagePath, { recursive: true, force: true });
      console.log("✅ RemoteStorage temp data cleaned");
    } catch (error) {
      console.warn("⚠️  Failed to clean temp storage:", error);
    }
  }

  // Clean up test env file
  if (fs.existsSync(testEnvPath)) {
    console.log("Cleaning up test environment file...");
    try {
      fs.unlinkSync(testEnvPath);
      console.log("✅ Test environment file removed");
    } catch (error) {
      console.warn("⚠️  Failed to remove test env file:", error);
    }
  }

  console.log("✅ Global teardown complete\n");
}
