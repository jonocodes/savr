# RemoteStorage Test Server

A pre-configured RemoteStorage server for automated testing with curl and for connecting your app's RemoteStorage widget.

## Quick Start

### Option 1: Interactive Demo (Recommended)

```bash
cd test-server
./demo-widget-connection.sh
```

This script will:
- Start the server
- Test WebFinger discovery
- Show you how to connect your app's widget
- Display the API token for testing

### Option 2: Manual Start

```bash
cd test-server
node armadietto.cjs
```

This will:
- Create a test user (`testuser` / `testpass`)
- Generate an OAuth token for API access
- Start the server on `http://127.0.0.1:8004`
- Print the token and example curl commands

## Connecting Your App

**👉 See [WIDGET-QUICKSTART.md](WIDGET-QUICKSTART.md) for a visual step-by-step guide!**

Or see [README-connect-widget.md](README-connect-widget.md) for detailed technical documentation.

**Quick steps:**
1. Start server: `cd test-server && ./demo-widget-connection.sh`
2. Start app: `npm run dev`
3. Click RemoteStorage widget (bottom-right)
4. Enter: `testuser@127.0.0.1:8004`
5. Password: `testpass`
6. Approve authorization

## API Testing

### Use the token for testing

The server will print curl commands you can use immediately. For example:

```bash
# Write a file
curl -X PUT -H 'Authorization: Bearer <TOKEN>' \
  http://127.0.0.1:8004/storage/testuser/test.txt \
  -d 'hello world'

# Read a file
curl -H 'Authorization: Bearer <TOKEN>' \
  http://127.0.0.1:8004/storage/testuser/test.txt

# List directory
curl -H 'Authorization: Bearer <TOKEN>' \
  http://127.0.0.1:8004/storage/testuser/
```

### 3. Run automated tests

```bash
./test-storage.sh <TOKEN>
```

This runs a comprehensive test suite including:
- Writing and reading files
- JSON data storage
- Directory listings
- Nested paths

## Configuration

The server is configured in [armadietto.cjs](armadietto.cjs):

- **Storage path**: `/tmp/restore`
- **Host**: `127.0.0.1`
- **Port**: `8004`
- **Test user**: `testuser` / `testpass`
- **Permissions**: Full read/write access to root path (`/`)
- **Signup**: Disabled (users must be created programmatically)

## API Endpoints

### Storage Operations

- `PUT /storage/testuser/<path>` - Write/update a file
- `GET /storage/testuser/<path>` - Read a file or list directory
- `DELETE /storage/testuser/<path>` - Delete a file
- `HEAD /storage/testuser/<path>` - Get metadata without content

### Headers

- **Authorization**: `Bearer <token>` (required)
- **Content-Type**: Set appropriately for the data (optional)
- **If-Match**: ETag for conditional updates (optional)
- **If-None-Match**: `*` to only create if doesn't exist (optional)

## Directory Structure

Files are stored in `/tmp/restore/te/testuser/storage/`:

```
/tmp/restore/
└── te/
    └── testuser/
        ├── auth.json          # User credentials and tokens
        └── storage/           # Actual data files
            ├── .~meta         # Metadata for root directory
            └── <your files>
```

## Response Format

### File Read
Returns the file content with headers:
- `Content-Type`: The MIME type
- `ETag`: Version identifier
- `Content-Length`: File size

### Directory Listing
Returns JSON:
```json
{
  "@context": "http://remotestorage.io/spec/folder-description",
  "items": {
    "filename.txt": {
      "ETag": "1234567890",
      "Content-Type": "text/plain",
      "Content-Length": 11
    }
  }
}
```

## Token Management

Each time you start the server, it generates a **new token**. The token is stored in `/tmp/restore/te/testuser/auth.json`.

To use the same token across restarts:
1. Start the server once
2. Copy the token from the output
3. Use that token in your tests

Or modify [armadietto.cjs](armadietto.cjs) to reuse existing tokens.

## Troubleshooting

### Port already in use
Change the port in [armadietto.cjs](armadietto.cjs:37):
```javascript
http: { host: "127.0.0.1", port: 8005 },
```

### Permission denied
The server sets `umask(0o77)` to restrict file access. Files are only readable by the running user.

### Token not working
- Each server restart generates a new token
- Copy the token from the server output
- Ensure you're using `Authorization: Bearer <token>` header

### Clean slate
Remove the storage directory:
```bash
rm -rf /tmp/restore
```

## Integration with Automated Tests

For use in CI/CD or automated test scripts:

```bash
# Start server in background
node armadietto.cjs > /tmp/storage-server.log 2>&1 &
SERVER_PID=$!

# Extract token from log
sleep 2
TOKEN=$(grep "Token:" /tmp/storage-server.log | awk '{print $2}')

# Run your tests
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/test.txt \
  -d "test data"

# Cleanup
kill $SERVER_PID
rm -rf /tmp/restore
```

## References

- [RemoteStorage Protocol](https://remotestorage.io/)
- [Armadietto Documentation](https://github.com/remotestorage/armadietto)
