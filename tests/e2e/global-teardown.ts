import fs from "fs";
import path from "path";

function killProcess(pid: number | undefined, name: string): void {
  if (!pid) return;

  console.log(`Stopping ${name} (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
    // Give it a moment to clean up, then force kill
    setTimeout(() => {
      try {
        process.kill(pid, 0); // Check if still running
        process.kill(pid, "SIGKILL");
      } catch {
        // Process already dead, which is fine
      }
    }, 1000);
    console.log(`✅ ${name} stopped`);
  } catch {
    // Process may already be dead
    console.log(`⚠️  ${name} was not running (PID: ${pid})`);
  }
}

export default async function globalTeardown() {
  console.log("\n🧹 Running global teardown...\n");

  // Read PIDs from test env file and kill servers
  const testEnvPath = path.join(process.cwd(), "tests/e2e/.test-env.json");
  if (fs.existsSync(testEnvPath)) {
    try {
      const testEnv = JSON.parse(fs.readFileSync(testEnvPath, "utf-8"));
      killProcess(testEnv.ARMADIETTO_PID, "Armadietto server");
      killProcess(testEnv.CONTENT_SERVER_PID, "Content server");
      // Give processes time to terminate
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      console.warn("⚠️  Failed to read test env for cleanup:", err);
    }
  }

  // Clean up temp storage directory
  // Must match STORAGE_PORT in global-setup.ts
  const storagePath = "/tmp/restore8006";
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
