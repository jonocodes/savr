# RemoteStorage Widget Quick Start

Connect your app to the test server in 60 seconds!

> **Note**: This guide uses port 8004 for manual development. Automated tests use port 8006 automatically via `NODE_ENV=test`.

## TL;DR

```bash
# Terminal 1: Start test server
cd test-server
./demo-widget-connection.sh

# Terminal 2: Start your app
npm run dev

# In browser: Click widget → Enter: testuser@localhost:8004 → Password: testpass
```

---

## Step-by-Step

### 1️⃣ Start the Test Server

```bash
cd test-server
./demo-widget-connection.sh
```

You'll see:
```
✓ Server started successfully
✓ WebFinger discovery working

================================================
Server Ready for Widget Connection
================================================

3. Click the widget and enter:
   testuser@localhost:8004

4. When prompted for password, enter:
   testpass
```

**Leave this terminal open** - the server needs to keep running.

---

### 2️⃣ Start Your App

Open a **new terminal** and run:

```bash
npm run dev
```

Open your app in a browser (usually `http://localhost:8000` or similar).

---

### 3️⃣ Connect the Widget

Look for the **RemoteStorage widget** in the bottom-right corner of your app:

```
┌─────────────────────────────┐
│                             │
│   Your App Content          │
│                             │
│                       [🔗]  │  ← Widget here
└─────────────────────────────┘
```

**Click the widget** and you'll see a connection form.

---

### 4️⃣ Enter User Address

In the widget's input field, type:

```
testuser@localhost:8004
```

Click **"Connect"**.

---

### 5️⃣ Authorize the App

Your browser will redirect to:
```
http://localhost:8004/oauth/testuser?...
```

You'll see a login form:

- **Username**: `testuser` (already filled)
- **Password**: `testpass`

Click **"Authorize"**.

---

### 6️⃣ You're Connected! ✨

The widget will show:
```
✓ Connected to testuser@localhost:8004
```

Your app is now syncing with the test server!

---

## What Just Happened?

1. **WebFinger Discovery**: The widget asked `localhost:8004/.well-known/webfinger` where to find your storage
2. **OAuth Flow**: You logged in and authorized your app to access `/savr/` (your app's scope)
3. **Token Grant**: The server gave your app an access token
4. **Sync Active**: Your app can now read/write articles to the test server

---

## Verify It's Working

### Check Browser Console

You should see:
```
remoteStorage ready
remoteStorage connected to "testuser@localhost:8004"
```

### Check Storage Files

```bash
ls -la /tmp/restore/te/testuser/storage/savr/
```

When you save articles in your app, they'll appear here!

### Check with curl

Use the token from the demo script:

```bash
# List all saved articles
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8004/storage/testuser/savr/saves/
```

---

## Troubleshooting

### Widget says "Connection failed"

**Check:**
- Is the server still running? (Terminal 1 should show logs)
- Did you enter `testuser@localhost:8004` exactly?
- Is port 8004 free? Run: `lsof -i:8004`

**Debug:**
- Open browser DevTools → Network tab
- Look for failed requests
- Check console for errors

### "Invalid password"

Make sure you're using `testpass` (not the API token).

### Widget not visible

**Check:**
- Is sync enabled in your app's preferences?
- Are you on an article detail page? (Widget hides on article pages)

### No data syncing

**Check browser console** for errors like:
- `403 Forbidden` → OAuth token doesn't have permission
- `401 Unauthorized` → Token invalid or expired
- `404 Not Found` → Check the path

---

## Next Steps

- **Test sync**: Open your app in two browser tabs, save in one, see it appear in the other
- **API testing**: Use [../test-server/test-storage.sh](../test-server/test-storage.sh) for automated tests
- **Deep dive**: Read [README-connect-widget.md](README-connect-widget.md) for details
- **Server details**: See [README-storage-server.md](README-storage-server.md)

---

## Common Commands

```bash
# Start server with demo
cd test-server && ./demo-widget-connection.sh

# Start server manually
cd test-server && node armadietto.cjs

# Run automated tests
cd test-server && ./test-storage.sh <TOKEN>

# Stop server
lsof -ti:8004 | xargs kill -9

# Clear all data
rm -rf /tmp/restore

# Check server logs
tail -f /tmp/storage-server.log
```

---

**Questions?** Check [README-connect-widget.md](README-connect-widget.md) for detailed documentation.
