process.umask(0o77);

const Armadietto = require("armadietto");

async function setupTestServer() {
  const store = new Armadietto.FileTree({ path: "/tmp/restore" });

  // Create test user programmatically
  let userExists = false;
  try {
    await store.createUser({
      username: "testuser",
      password: "testpass",
      email: "test@example.com"
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
  const token = await store.authorize(
    "http://localhost:3000",  // client_id
    "testuser",
    { "/": ["r", "w"] }  // root path with read/write permissions
  );

  const server = new Armadietto({
    store: store,
    http: { host: "127.0.0.1", port: 8004 },
    allow: { signup: false },
  });

  await server.boot();

  console.log("\n" + "=".repeat(60));
  console.log("RemoteStorage Test Server Running");
  console.log("=".repeat(60));
  console.log("Server URL: http://127.0.0.1:8004");
  console.log("Username:   testuser");
  console.log("Token:      " + token);
  console.log("\nTest commands:");
  console.log("\n# Write a file:");
  console.log(`curl -X PUT -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://127.0.0.1:8004/storage/testuser/test.txt \\`);
  console.log(`  -d 'hello world'`);
  console.log("\n# Read a file:");
  console.log(`curl -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://127.0.0.1:8004/storage/testuser/test.txt`);
  console.log("\n# List directory:");
  console.log(`curl -H 'Authorization: Bearer ${token}' \\`);
  console.log(`  http://127.0.0.1:8004/storage/testuser/`);
  console.log("=".repeat(60) + "\n");
}

setupTestServer().catch(console.error);
