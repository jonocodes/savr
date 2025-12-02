#!/bin/bash
# Test script for RemoteStorage server
# Usage: ./test-storage.sh [token]

set -e

TOKEN="${1:-}"
PORT="${PORT:-8004}"
HOST="${HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}/storage/testuser"

if [ -z "$TOKEN" ]; then
  echo "Error: No token provided"
  echo "Usage: $0 <token>"
  echo ""
  echo "Start the server first with: flox activate -- node armadietto.cjs"
  echo "Then use the token printed in the output"
  exit 1
fi

echo "Testing RemoteStorage server at $BASE_URL"
echo ""

# Test 1: Write a file
echo "1. Writing test file..."
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/test.txt" \
  -d 'hello world' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""

# Test 2: Read the file back
echo "2. Reading test file..."
CONTENT=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/test.txt")
echo "Content: $CONTENT"

if [ "$CONTENT" = "hello world" ]; then
  echo "✓ Content matches!"
else
  echo "✗ Content mismatch!"
  exit 1
fi

echo ""

# Test 3: List directory
echo "3. Listing directory..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/" | jq '.'

echo ""

# Test 4: Write JSON file
echo "4. Writing JSON file..."
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$BASE_URL/data.json" \
  -d '{"message": "test data", "timestamp": 1234567890}' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""

# Test 5: Read JSON file
echo "5. Reading JSON file..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/data.json" | jq '.'

echo ""

# Test 6: Create nested path
echo "6. Writing to nested path..."
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/foo/bar/nested.txt" \
  -d 'nested content' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""

# Test 7: List nested directory
echo "7. Listing nested directory..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/foo/bar/" | jq '.'

echo ""
echo "✓ All tests completed!"
