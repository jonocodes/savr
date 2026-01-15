import fs from "fs";
import path from "path";

export default async function globalTeardown() {
  console.log("\n🧹 Running global teardown...\n");

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

  // const storagePath2 = "/tmp/restore8004";
  // const contents2 = fs.readdirSync(storagePath2);
  // console.log("contents2", contents2);
  // // list the contents of the directory recursively
  // const contentsRecursive2 = fs.readdirSync(storagePath2, { recursive: true });
  // console.log("contentsRecursive2", contentsRecursive2);

  // Clean up test env file
  const testEnvPath = path.join(process.cwd(), "tests/e2e/.test-env.json");
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
