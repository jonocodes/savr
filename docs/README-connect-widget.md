# Connecting Your App to the Test RemoteStorage Server

Your app uses the RemoteStorage widget which allows users to connect to any RemoteStorage server. Here's how to connect it to your test server.

## Quick Start

### 1. Start the test server
```bash
cd test-server
flox activate -- node armadietto.cjs
```

Note the token that's printed - you'll use it later for API testing.

### 2. Start your app
```bash
npm run dev
```

### 3. Connect using the widget

In your app's UI, you should see a RemoteStorage widget (usually in the bottom-right corner). Click on it and enter:

```
testuser@127.0.0.1:8004
```

Then click "Connect" and when prompted, enter the password:
```
testpass
```

The widget will:
1. Perform WebFinger discovery at `http://127.0.0.1:8004/.well-known/webfinger?resource=acct:testuser@127.0.0.1:8004`
2. Get the storage API endpoint
3. Show an OAuth authorization page
4. After you approve, redirect back with an access token
5. Your app will be connected and can read/write to `/savr/*` in the storage

## Understanding the Setup

### App Storage Structure

Your app ([storage.ts](src/utils/storage.ts:23)) uses the scope `/savr/` and stores articles at:
- `saves/*/article.json` - Article metadata and content

### Widget Configuration

The widget ([RemoteStorageProvider.tsx](src/components/RemoteStorageProvider.tsx)) is configured to:
- Appear in the bottom-right corner (when sync is enabled)
- Claim `rw` (read/write) access to the `/savr/` scope
- Support Google Drive and Dropbox (via API keys) as well as any RemoteStorage server

### OAuth Flow

When you connect via the widget:

1. **User enters address**: `testuser@127.0.0.1:8004`
2. **WebFinger discovery**: Widget queries `/.well-known/webfinger`
3. **OAuth redirect**: Browser opens `http://127.0.0.1:8004/oauth/testuser?client_id=...&scope=savr:rw`
4. **User login**: Enter password `testpass` and approve
5. **Token grant**: Server generates token and redirects back
6. **Connected**: Widget stores token and app can access storage

## Manual OAuth Flow (for testing)

If you want to manually test the OAuth flow:

### 1. Start the server
```bash
flox activate -- node armadietto.cjs
```

### 2. Build the OAuth URL
Open in your browser:
```
http://127.0.0.1:8004/oauth/testuser?client_id=http://localhost:8000&redirect_uri=http://localhost:8000&response_type=token&scope=savr:rw&state=test123
```

### 3. Login
- Username: `testuser`
- Password: `testpass`
- Click "Authorize"

### 4. Extract token
After redirect, the URL will contain:
```
http://localhost:8000#access_token=XXXXXXXX&token_type=bearer&state=test123
```

The `access_token` is your OAuth token (different from the one printed at server startup).

## Programmatic Testing

For automated testing without the widget, use the token printed when the server starts:

```bash
# Server prints this token at startup
TOKEN="cDikVtDo8g2akTq1xjDjIbWg4xs="

# Write an article
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8004/storage/testuser/savr/saves/test-123/article.json \
  -d '{
    "id": "test-123",
    "url": "https://example.com/test",
    "title": "Test Article",
    "content": "Test content",
    "savedAt": "2025-12-02T18:00:00Z"
  }'

# Read it back
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/savr/saves/test-123/article.json

# List all articles
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/savr/saves/
```

## Differences Between Tokens

Your test server generates **two types of tokens**:

1. **Startup token** (printed in server output)
   - Pre-generated for CLI/API testing
   - Full read/write access to `/` (root)
   - Doesn't expire (until server restart)
   - Use with: `Authorization: Bearer <token>`

2. **OAuth tokens** (via widget/browser flow)
   - Generated during user login
   - Scoped to what the app requests (e.g., `/savr/`)
   - Managed by the widget automatically
   - User can revoke via account page

For widget testing, you'll use OAuth tokens (option 2). For automated testing, use the startup token (option 1).

## Troubleshooting

### Widget says "Failed to connect"

**Check:**
1. Server is running on `127.0.0.1:8004`
2. You entered `testuser@127.0.0.1:8004` (not just `testuser`)
3. Password is `testpass`
4. CORS is enabled (Armadietto enables this by default)

**Debug:**
- Open browser DevTools → Network tab
- Look for requests to `/.well-known/webfinger` and `/oauth/testuser`
- Check console for errors

### "Invalid password" error

Make sure you're using `testpass` not the OAuth token.

### Data not syncing

**Check:**
1. Widget shows "Connected" status (green)
2. Browser console shows `remoteStorage connected to "testuser@127.0.0.1:8004"`
3. Sync is enabled in preferences
4. Check storage directly:
   ```bash
   ls -la /tmp/restore/te/testuser/storage/savr/
   ```

### Server token doesn't work with widget

The pre-generated server token is for direct API access only. The widget uses its own OAuth flow to get a token. They're different tokens with different scopes.

### Widget not visible

Check [PreferenceScreen.tsx](src/components/PreferenceScreen.tsx) - sync must be enabled. The widget is hidden on article pages.

## Testing Sync Between Devices

To test sync between multiple browser tabs:

1. Connect in Tab 1: `testuser@127.0.0.1:8004`
2. Save an article in Tab 1
3. Connect in Tab 2: `testuser@127.0.0.1:8004`
4. Article should appear in Tab 2

Note: RemoteStorage doesn't have real-time sync - tabs poll for changes.

## Advanced: Using Different User Addresses

To test with multiple users, modify [../test-server/armadietto.cjs](../test-server/armadietto.cjs) to create additional users:

```javascript
// Create multiple test users
for (const username of ["testuser", "alice", "bob"]) {
  try {
    await store.createUser({
      username: username,
      password: "testpass",
      email: `${username}@example.com`
    });
    const token = await store.authorize(
      "http://localhost:3000",
      username,
      { "/": ["r", "w"] }
    );
    console.log(`${username}: ${token}`);
  } catch (error) {
    // User exists
  }
}
```

Then connect with:
- `alice@127.0.0.1:8004`
- `bob@127.0.0.1:8004`

Each user has isolated storage.

## Storage Layout

After connecting and saving articles, your storage looks like:

```
/tmp/restore/te/testuser/storage/
└── savr/
    └── saves/
        ├── article-123/
        │   └── article.json
        ├── article-456/
        │   └── article.json
        └── .~meta
```

You can inspect this directly:
```bash
cat /tmp/restore/te/testuser/storage/savr/saves/article-123/article.json
```

## Next Steps

- See [README-storage-server.md](README-storage-server.md) for server details
- See [../test-server/test-storage.sh](../test-server/test-storage.sh) for automated API testing
- Check [../src/utils/storage.ts](../src/utils/storage.ts) to understand app data model
