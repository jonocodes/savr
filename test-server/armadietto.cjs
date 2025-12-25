process.umask(0o77);

const Armadietto = require("armadietto");

async function setupTestServer() {
  // Detect if running in automated testing mode
  // Can be set via NODE_ENV=test or AUTOMATED_TEST=true
  const isAutomatedTest =
    process.env.NODE_ENV === "test" ||
    process.env.AUTOMATED_TEST === "true" ||
    process.env.CI === "true";

  // Set ports based on mode
  // Automated testing: app on 3002, storage on 8006
  // Manual testing: app on 3000, storage on 8004
  const appPort = process.env.APP_PORT || (isAutomatedTest ? 3002 : 3000);
  const storagePort = process.env.STORAGE_PORT || (isAutomatedTest ? 8006 : 8004);

  const mode = isAutomatedTest ? "AUTOMATED TEST" : "MANUAL";
  console.log(`\n🔧 Starting in ${mode} mode`);
  console.log(`   App port: ${appPort}, Storage port: ${storagePort}\n`);

  const store = new Armadietto.FileTree({ path: "/tmp/restore" });

  // Create test user programmatically
  let userExists = false;
  try {
    await store.createUser({
      username: "testuser",
      password: "testpass",
      email: "test@example.com",
    });
    console.log("✓ Test user created: testuser / testpass");
  } catch (error) {
    // User might already exist, that's ok
    if (error.message.includes("already taken")) {
      console.log("✓ Test user already exists");
      userExists = true;
    } else {
      console.log("Warning:", error.message);
    }
  }

  // Generate an OAuth token for automated testing
  // Scope format: path:permissions (e.g., "/:rw" for root read/write)
  const clientId = `http://localhost:${appPort}`;
  const token = await store.authorize(
    clientId, // client_id - must match the app's origin
    "testuser",
    { "/": ["r", "w"] } // root path with read/write permissions
  );

  const server = new Armadietto({
    store: store,
    http: { host: "localhost", port: storagePort },
    allow: { signup: false },
    // Enable CORS for cross-origin requests from the app
    https: false,
  });

  await server.boot();

  console.log("\n" + "=".repeat(60));
  console.log("RemoteStorage Test Server Running");
  console.log("=".repeat(60));
  console.log(`Server URL: http://localhost:${storagePort}`);
  console.log(`App URL:    http://localhost:${appPort}`);
  console.log("Username:   testuser");
  console.log("Token:      " + token);
  console.log("\nTest commands:");
  console.log("\n# Write a file:");
  console.log(`curl -X PUT -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://localhost:${storagePort}/storage/testuser/test.txt \\`);
  console.log(`  -d 'hello world'`);
  console.log("\n# Read a file:");
  console.log(`curl -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://localhost:${storagePort}/storage/testuser/test.txt`);
  console.log("\n# List directory:");
  console.log(`curl -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://localhost:${storagePort}/storage/testuser/`);
  console.log("=".repeat(60) + "\n");
}

setupTestServer().catch(console.error);
