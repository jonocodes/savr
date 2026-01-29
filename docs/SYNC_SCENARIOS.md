# Article Sync Scenarios to Preserve

This document enumerates all the sync scenarios that must work correctly. These should be covered by tests to prevent regression.

## Scenario Categories

### 1. Real-time Sync (Both Browsers Open)

#### 1.1 Article Addition
- **Given**: Browser A and Browser B are both open and synced
- **When**: User adds a new article in Browser A
- **Then**: Article appears in Browser B within seconds
- **Implementation**: Change event with `newValue`, `oldValue=undefined`, article not in DB → Process as new addition

#### 1.2 Article Update (Archive/Unarchive)
- **Given**: Browser A and Browser B are both open, article exists in both
- **When**: User archives/unarchives article in Browser A
- **Then**: Article state updates in Browser B within seconds
- **Implementation**: Change event with both `newValue` and `oldValue` → Process as update, or `existingArticle !== null` → Process as update

#### 1.3 Article Deletion
- **Given**: Browser A and Browser B are both open, article exists in both
- **When**: User deletes article in Browser A
- **Then**: Article disappears from Browser B within seconds
- **Implementation**: Change event with `oldValue`, `newValue=undefined` → Delete from DB

### 2. Catchup Sync (Browser Reopened After Being Closed)

#### 2.1 Article Addition While Closed
- **Given**: Browser B is closed, Browser A is open
- **When**: User adds new article in Browser A, then reopens Browser B
- **Then**: New article appears in Browser B during sync
- **Implementation**: `processMissingArticles()` compares listing with DB, fetches missing articles

#### 2.2 Article Update While Closed
- **Given**: Browser B is closed, Browser A is open, article exists
- **When**: User archives/unarchives in Browser A, then reopens Browser B
- **Then**: Article state updates in Browser B during sync
- **Implementation**: Change event with `newValue`, `oldValue=undefined`, but `existingArticle !== null` → Process as update (not new addition)

#### 2.3 Article Deletion While Closed
- **Given**: Browser B is closed, Browser A is open, article exists
- **When**: User deletes article in Browser A, then reopens Browser B
- **Then**: Article is removed from Browser B during sync
- **Implementation**: `processDeletedArticles()` compares DB with listing, deletes articles in DB but not in listing

### 3. Initial Sync (Empty Database)

#### 3.1 First Time Connection
- **Given**: Browser connects for first time with empty IndexedDB
- **When**: RemoteStorage has 100+ articles
- **Then**:
  - Shows "Initial sync: X/Y articles" with accurate progress
  - Uses listing count as total (not DB count)
  - Processes all articles via change events and/or `processMissingArticles()`
  - Prioritizes non-archived articles first, then newest first

### 4. Subsequent Sync (Existing Database)

#### 4.1 Reconnection with Existing Data
- **Given**: Browser reconnects with existing synced data
- **When**: RemoteStorage sync begins
- **Then**:
  - Shows "Syncing: X/Y articles" (not "Initial sync")
  - Uses DB count as total (ignores dangling/corrupted articles)
  - Quickly completes if no changes
  - Processes any missing or deleted articles via catchup functions

### 5. Edge Cases

#### 5.1 Dangling Articles
- **Given**: RemoteStorage has directory with no/corrupted article.json
- **When**: Sync completes
- **Then**: Progress total reflects actual DB count, not listing count (ignores dangling)

#### 5.2 Duplicate Prevention
- **Given**: Article already processed in current session
- **When**: Change event fires again for same article
- **Then**: Skip processing (unless it's an update)

#### 5.3 Multiple Changes While Closed
- **Given**: Browser B closed, multiple operations in Browser A (add 5, delete 2, update 3)
- **When**: Browser B reopens
- **Then**: All changes sync correctly (5 added, 2 removed, 3 updated)

## Key Implementation Details

### Update Detection Logic (storage.ts:508)
```typescript
const isUpdate = event.oldValue !== undefined || existingArticle !== null;
```
- `oldValue !== undefined`: File was in RemoteStorage cache and changed (browser was open)
- `existingArticle !== null`: Article exists in IndexedDB (handles reopened browser case)

### Addition Processing (storage.ts:510-520)
- For new additions only: Skip if already processed this session
- For new additions only: Skip if somehow already in DB
- For updates: Always process regardless of processed state

### Deletion Processing (storage.ts:543-557)
- Requires `oldValue !== undefined` and `newValue === undefined`
- Falls back to `processDeletedArticles()` for browser-closed scenario

### Catchup Functions
1. **processMissingArticles()** (storage.ts:167-219): Handles additions made while closed
2. **processDeletedArticles()** (storage.ts:221-265): Handles deletions made while closed

Both run after sync completes (sync-done, sync-req-done events).

## Testing Strategy

See SYNC_TESTING.md for unit test approach.
