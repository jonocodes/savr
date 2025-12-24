# RemoteStorage Test Server

A complete local RemoteStorage server setup for development and testing your app's sync functionality.

## Quick Start

```bash
./demo-widget-connection.sh
```

Then connect your app's widget to: `testuser@127.0.0.1:8004` (password: `testpass`)

## Getting Started

**New to this?** Start here:

- 📖 [../docs/WIDGET-QUICKSTART.md](../docs/WIDGET-QUICKSTART.md) - Visual step-by-step guide (60 seconds)

## Files in this Directory

- **[armadietto.cjs](armadietto.cjs)** - Server configuration that auto-creates test user
- **[demo-widget-connection.sh](demo-widget-connection.sh)** - Interactive demo script
- **[test-storage.sh](test-storage.sh)** - Automated API testing suite

## Documentation Guides

- **[../docs/WIDGET-QUICKSTART.md](../docs/WIDGET-QUICKSTART.md)** - Quick visual guide to connecting your app
- **[../docs/README-connect-widget.md](../docs/README-connect-widget.md)** - Detailed widget integration documentation
- **[../docs/README-storage-server.md](../docs/README-storage-server.md)** - Server configuration and API reference

## Usage

### Start Server

```bash
# Interactive (recommended)
./demo-widget-connection.sh

# Manual
node armadietto.cjs
```

### Connect Widget

1. Click RemoteStorage widget in your app (bottom-right)
2. Enter: `testuser@127.0.0.1:8004`
3. Password: `testpass`
4. Approve authorization

### Run Tests

```bash
./test-storage.sh <TOKEN>
```

### Stop Server

```bash
lsof -ti:8004 | xargs kill -9
```

## Test User

- **Username**: `testuser`
- **Password**: `testpass`
- **Address**: `testuser@127.0.0.1:8004`

## Server Configuration

- **Host**: `127.0.0.1`
- **Port**: `8004`
- **Storage**: `/tmp/restore`
- **Scope**: Full access to `/` path

## Common Tasks

### Connect App to Test Server

See [../docs/WIDGET-QUICKSTART.md](../docs/WIDGET-QUICKSTART.md)

### Run Automated Tests

```bash
# Get token from server output, then:
./test-storage.sh <TOKEN>
```

### Understand OAuth Flow

See [../docs/README-connect-widget.md](../docs/README-connect-widget.md#manual-oauth-flow-for-testing)

### Configure Server

Edit [armadietto.cjs](armadietto.cjs) to change port, user credentials, or storage path.

See [../docs/README-storage-server.md](../docs/README-storage-server.md#configuration) for details.

### Troubleshoot Connection

See [../docs/WIDGET-QUICKSTART.md](../docs/WIDGET-QUICKSTART.md#troubleshooting)

## What's What?

| File                                                                 | Purpose                      |
| -------------------------------------------------------------------- | ---------------------------- |
| [armadietto.cjs](armadietto.cjs)                                     | Server code                  |
| [demo-widget-connection.sh](demo-widget-connection.sh)               | Demo script                  |
| [test-storage.sh](test-storage.sh)                                   | Test suite                   |
| [../docs/WIDGET-QUICKSTART.md](../docs/WIDGET-QUICKSTART.md)         | 60-second visual guide       |
| [../docs/README-connect-widget.md](../docs/README-connect-widget.md) | Technical OAuth flow details |
| [../docs/README-storage-server.md](../docs/README-storage-server.md) | Server API and configuration |

## API Testing Examples

After starting the server, you'll get a token. Use it for direct API access:

```bash
TOKEN="<token-from-server-output>"

# Write a file
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/test.txt \
  -d 'hello world'

# Read a file
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/test.txt

# List directory
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8004/storage/testuser/

# Create article for your app
curl -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8004/storage/testuser/savr/saves/test-123/article.json \
  -d '{
    "id": "test-123",
    "url": "https://example.com/test",
    "title": "Test Article",
    "savedAt": "2025-12-02T19:00:00Z"
  }'
```

## Storage Layout

Your app stores data at `/savr/saves/`:

```
/tmp/restore/te/testuser/storage/
└── savr/
    └── saves/
        ├── article-123/
        │   └── article.json
        └── article-456/
            └── article.json
```

Inspect directly:

```bash
ls -la /tmp/restore/te/testuser/storage/savr/saves/
cat /tmp/restore/te/testuser/storage/savr/saves/*/article.json
```

## Cleaning Up

```bash
# Stop server
lsof -ti:8004 | xargs kill -9

# Clear all data
rm -rf /tmp/restore

# View logs
tail -f /tmp/storage-server.log
```

## Advanced Usage

### Multiple Users

Edit [armadietto.cjs](armadietto.cjs) to create additional test users. See [../docs/README-connect-widget.md](../docs/README-connect-widget.md#advanced-using-different-user-addresses).

### Integration with CI/CD

See [../docs/README-connect-widget.md](../docs/README-connect-widget.md#integration-with-automated-tests) for examples.

### Custom Configuration

- Change port: Edit `http: { port: 8004 }` in [armadietto.cjs](armadietto.cjs)
- Change storage path: Edit `path: "/tmp/restore"`
- Add users: Add more `store.createUser()` calls
