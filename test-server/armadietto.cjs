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

  const storagePath = `/tmp/restore${storagePort}`;

  const mode = isAutomatedTest ? "AUTOMATED TEST" : "MANUAL";
  console.log(`\n🔧 Starting in ${mode} mode`);
  console.log(`   App port: ${appPort}, Storage port: ${storagePort}\n`);

  const store = new Armadietto.FileTree({ path: storagePath });

  // Create one test user per worker so parallel test workers don't share storage.
  // MAX_TEST_WORKERS must match the workers count in playwright.config.ts.
  const maxWorkers = parseInt(process.env.MAX_TEST_WORKERS || "4", 10);
  const clientId = `http://localhost:${appPort}`;
  const tokens = [];

  for (let i = 0; i < maxWorkers; i++) {
    const username = `testuser${i}`;
    try {
      await store.createUser({
        username,
        password: "testpass",
        email: `test${i}@example.com`,
      });
      console.log(`✓ Test user created: ${username}`);
    } catch (error) {
      if (error.message.includes("already taken")) {
        console.log(`✓ Test user already exists: ${username}`);
      } else {
        console.log("Warning:", error.message);
      }
    }
    const token = await store.authorize(clientId, username, { "/": ["r", "w"] });
    tokens.push(token);
    console.log(`Token[${i}]: ${token}`);
  }

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
  console.log(`Storage path: ${storagePath}`);
  console.log(`Workers:    ${maxWorkers} (testuser0 … testuser${maxWorkers - 1})`);
  console.log(`Token[0]:   ${tokens[0]} (sample)`);
  console.log("\nSample commands for testuser0:");
  console.log("\n# Write a file:");
  console.log(`curl -X PUT -H 'Authorization: Bearer ${tokens[0]}' \\`);
  console.log(`  http://localhost:${storagePort}/storage/testuser0/test.txt \\`);
  console.log(`  -d 'hello world'`);
  console.log("=".repeat(60) + "\n");
}

setupTestServer().catch(console.error);
