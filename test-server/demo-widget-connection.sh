#!/bin/bash
# Demo script showing how to connect the RemoteStorage widget to the test server

set -e

echo "=================================================="
echo "RemoteStorage Widget Connection Demo"
echo "=================================================="
echo ""

# Check if server is already running
if lsof -i:8004 > /dev/null 2>&1; then
  echo "⚠️  Server already running on port 8004"
  echo "Stopping existing server..."
  lsof -ti:8004 | xargs kill -9 2>/dev/null || true
  sleep 2
fi

echo "Starting RemoteStorage server..."
node armadietto.cjs > /tmp/storage-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Extract token from log
TOKEN=$(grep "Token:" /tmp/storage-server.log | awk '{print $2}' | head -1)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to start server"
  cat /tmp/storage-server.log
  exit 1
fi

echo "✓ Server started successfully"
echo ""

# Test WebFinger endpoint
echo "Testing WebFinger discovery..."
WEBFINGER_RESULT=$(curl -s "http://127.0.0.1:8004/.well-known/webfinger?resource=acct:testuser@127.0.0.1:8004")

if echo "$WEBFINGER_RESULT" | grep -q "remotestorage"; then
  echo "✓ WebFinger discovery working"
else
  echo "❌ WebFinger discovery failed"
  echo "$WEBFINGER_RESULT"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "=================================================="
echo "Server Ready for Widget Connection"
echo "=================================================="
echo ""
echo "1. Start your app:"
echo "   npm run dev"
echo ""
echo "2. Look for the RemoteStorage widget in the bottom-right"
echo ""
echo "3. Click the widget and enter:"
echo "   testuser@127.0.0.1:8004"
echo ""
echo "4. When prompted for password, enter:"
echo "   testpass"
echo ""
echo "5. Approve the authorization request"
echo ""
echo "Your app will then be connected to the test server!"
echo ""
echo "=================================================="
echo "Alternative: Direct API Testing"
echo "=================================================="
echo ""
echo "For automated testing without the widget, use this token:"
echo "TOKEN=$TOKEN"
echo ""
echo "Example: Create a test article"
echo ""
echo "curl -X PUT \\"
echo "  -H 'Authorization: Bearer $TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  http://127.0.0.1:8004/storage/testuser/savr/saves/demo-123/article.json \\"
echo "  -d '{"
echo '    "id": "demo-123",'
echo '    "url": "https://example.com/demo",'
echo '    "title": "Demo Article",'
echo '    "content": "This is a test article",'
echo '    "savedAt": "2025-12-02T19:00:00Z"'
echo "  }'"
echo ""
echo "=================================================="
echo ""
echo "Server is running in background (PID: $SERVER_PID)"
echo "Full server output: /tmp/storage-server.log"
echo ""
echo "To stop the server:"
echo "  kill $SERVER_PID"
echo "  # or"
echo "  lsof -ti:8004 | xargs kill -9"
echo ""
echo "Press Ctrl+C to stop this script (server will keep running)"
echo ""

# Keep script alive
trap "echo ''; echo 'Script stopped. Server still running.'; exit 0" INT TERM
tail -f /tmp/storage-server.log
