# Additional Sync Scenarios to Consider

This document outlines additional sync scenarios beyond the core CRUD operations documented in SYNC_SCENARIOS.md. These represent edge cases and failure modes common in production sync systems.

## Status: 🟡 For Future Consideration

Most of these scenarios are **not currently implemented** but should be evaluated for production readiness.

---

## 6. Conflict Resolution

### 6.1 Simultaneous Updates (Race Condition)
- **Given**: Browser A and Browser B both open, both have article in same state
- **When**: User archives article in Browser A, user unarchives same article in Browser B within 1 second
- **Then**: Last-write-wins (RemoteStorage's default behavior)
- **Current Status**: ⚠️ RemoteStorage handles this, but no explicit conflict detection
- **Risk**: Low (RemoteStorage protocol handles it)
- **Test Priority**: Medium

### 6.2 Offline Edits Collision
- **Given**: Browser A goes offline, makes changes. Browser B also makes changes to same article
- **When**: Browser A reconnects and syncs
- **Then**: Should detect conflicts and resolve (currently: last-write-wins)
- **Current Status**: ❌ No conflict detection
- **Risk**: Medium (data loss possible)
- **Test Priority**: Low (requires offline support first)

---

## 7. Network Reliability

### 7.1 Sync Interrupted Mid-Download
- **Given**: Initial sync downloading 100 articles
- **When**: Network disconnects after 50 articles downloaded
- **Then**: Resume from where left off when network returns
- **Current Status**: ✅ Handles gracefully (sync-done won't fire, will retry on reconnect)
- **Risk**: Low
- **Test Priority**: Low (RemoteStorage handles)

### 7.2 Partial File Download (Corrupted Data)
- **Given**: Large article being synced
- **When**: Network drops mid-file, partial JSON written to RemoteStorage
- **Then**: Detect corruption, skip or retry
- **Current Status**: ⚠️ `processArticleFile()` has try-catch, logs error, continues
- **Risk**: Low (RemoteStorage likely handles atomicity)
- **Test Priority**: Low

### 7.3 Very Slow Network (Timeout Scenarios)
- **Given**: Initial sync with 500 articles on 2G connection
- **When**: Some requests timeout
- **Then**: Retry failed requests, don't mark as complete
- **Current Status**: ⚠️ RemoteStorage handles retries, our code processes whatever arrives
- **Risk**: Low
- **Test Priority**: Low

### 7.4 Network Flip-Flopping (Rapid Connect/Disconnect)
- **Given**: Unstable network that connects/disconnects every 5 seconds
- **When**: Multiple sync cycles start and stop
- **Then**: Handle gracefully, avoid duplicate processing or state corruption
- **Current Status**: ⚠️ `isSyncing` flag and `processedArticles` set should prevent duplicates
- **Risk**: Medium (could cause weird progress UI)
- **Test Priority**: Medium

---

## 8. Concurrent Operations

### 8.1 Multiple Tabs Open (Same Browser)
- **Given**: User has 2 tabs open, both connected to RemoteStorage
- **When**: User archives article in Tab 1
- **Then**: Tab 2 should see the update
- **Current Status**: ⚠️ IndexedDB is shared, but RemoteStorage connections independent
- **Risk**: Medium (could cause desync between tabs)
- **Test Priority**: High (common scenario)
- **Notes**: IndexedDB updates should propagate via Dexie live queries, but RemoteStorage events might not

### 8.2 Rapid Sequential Changes (Same Article)
- **Given**: User rapidly archives/unarchives same article 10 times
- **When**: 10 change events fire quickly
- **Then**: Process all updates in order, end in correct state
- **Current Status**: ✅ Each update processes independently
- **Risk**: Low
- **Test Priority**: Low

### 8.3 Bulk Operations
- **Given**: User selects 50 articles and archives all at once
- **When**: 50 change events fire simultaneously
- **Then**: All process correctly without overwhelming system
- **Current Status**: ⚠️ No rate limiting, processes all in parallel
- **Risk**: Medium (could overwhelm browser/memory)
- **Test Priority**: Medium

---

## 9. Data Consistency & Corruption

### 9.1 Invalid JSON in RemoteStorage
- **Given**: RemoteStorage has malformed article.json (invalid JSON)
- **When**: Sync attempts to process it
- **Then**: Log error, skip article, continue sync
- **Current Status**: ✅ `processArticleFile()` has try-catch
- **Risk**: Low
- **Test Priority**: Low

### 9.2 Missing Required Fields
- **Given**: article.json exists but missing required fields (e.g., no slug)
- **When**: Article processed
- **Then**: Validate, log error, skip
- **Current Status**: ⚠️ No explicit validation, Dexie might error
- **Risk**: Medium
- **Test Priority**: Medium

### 9.3 Schema Version Mismatch
- **Given**: App updated with new schema, old data in RemoteStorage
- **When**: Sync loads old-format articles
- **Then**: Migrate or handle gracefully
- **Current Status**: ❌ No migration logic
- **Risk**: High (on schema changes)
- **Test Priority**: High (before any schema changes)

### 9.4 Orphaned Related Data
- **Given**: Article deleted but images/metadata remain in RemoteStorage
- **When**: Sync completes
- **Then**: Clean up orphaned data or ignore
- **Current Status**: ❌ No cleanup of related data
- **Risk**: Low (just wastes space)
- **Test Priority**: Low

---

## 10. Resource Limits

### 10.1 IndexedDB Quota Exceeded
- **Given**: Syncing 1000 articles, approaching browser storage limit
- **When**: Quota exceeded during sync
- **Then**: Detect error, notify user, provide cleanup options
- **Current Status**: ❌ No quota checking
- **Risk**: Medium (users with many articles)
- **Test Priority**: Medium

### 10.2 RemoteStorage Quota Exceeded
- **Given**: User's RemoteStorage server at capacity
- **When**: Attempting to save new article
- **Then**: Notify user, prevent save
- **Current Status**: ❌ No quota checking
- **Risk**: Medium
- **Test Priority**: Medium

### 10.3 Memory Pressure (Large Dataset)
- **Given**: Syncing 5000 articles with large content
- **When**: Browser memory constrained
- **Then**: Process in smaller batches, avoid loading all at once
- **Current Status**: ⚠️ Processes incrementally via change events (good), but listing loads all at once
- **Risk**: Medium
- **Test Priority**: Low

### 10.4 Very Large Individual Article
- **Given**: Article with 10MB of content/images
- **When**: Syncing
- **Then**: Handle gracefully without crashing
- **Current Status**: ⚠️ No size limits
- **Risk**: Low (users unlikely to save 10MB articles)
- **Test Priority**: Low

---

## 11. Authentication & Security

### 11.1 Token Expiration During Sync
- **Given**: Long-running initial sync (30+ minutes)
- **When**: RemoteStorage auth token expires mid-sync
- **Then**: Detect, prompt re-auth, resume sync
- **Current Status**: ⚠️ RemoteStorage might handle, but unclear
- **Risk**: Medium
- **Test Priority**: Medium

### 11.2 Account Disconnection During Sync
- **Given**: User disconnects RemoteStorage account
- **When**: Sync in progress
- **Then**: Stop sync, clear progress, handle gracefully
- **Current Status**: ⚠️ Probably works via RemoteStorage 'disconnected' event
- **Risk**: Low
- **Test Priority**: Low

### 11.3 Permission Changes
- **Given**: User revokes app's RemoteStorage permissions
- **When**: App attempts to sync
- **Then**: Detect permission error, notify user
- **Current Status**: ❌ No explicit handling
- **Risk**: Low (rare scenario)
- **Test Priority**: Low

---

## 12. Sync Interruption & Resume

### 12.1 Browser Closed Mid-Sync
- **Given**: Initial sync 50% complete (100/200 articles)
- **When**: User closes browser
- **Then**: On reopen, resume from where left off (not restart)
- **Current Status**: ✅ Handled well - `processMissingArticles()` only fetches missing
- **Risk**: Low
- **Test Priority**: Low (already works)

### 12.2 Browser Crash During Sync
- **Given**: Initial sync in progress
- **When**: Browser crashes (out of memory, force quit, etc.)
- **Then**: On restart, resume gracefully, no corrupted state
- **Current Status**: ✅ IndexedDB transactions should handle, `processMissingArticles()` resumes
- **Risk**: Low
- **Test Priority**: Low

### 12.3 System Sleep/Hibernate During Sync
- **Given**: Initial sync in progress on laptop
- **When**: User closes laptop lid (sleep)
- **Then**: On wake, detect, resume sync
- **Current Status**: ⚠️ Should work (network reconnect triggers sync), but untested
- **Risk**: Low
- **Test Priority**: Low

### 12.4 Tab Backgrounded for Long Time
- **Given**: Sync tab in background for hours
- **When**: Browser throttles/suspends tab
- **Then**: Resume sync when tab foregrounded
- **Current Status**: ⚠️ Depends on browser behavior
- **Risk**: Low
- **Test Priority**: Low

---

## 13. User Actions During Sync

### 13.1 User Adds Article During Initial Sync
- **Given**: Initial sync downloading 200 articles (50 done)
- **When**: User adds new article
- **Then**: New article syncs immediately, doesn't interfere with initial sync
- **Current Status**: ✅ Should work - change event processes independently
- **Risk**: Low
- **Test Priority**: Medium (good to verify)

### 13.2 User Deletes Article Being Synced
- **Given**: Initial sync about to download article X
- **When**: User deletes article X in another browser before it syncs
- **Then**: Skip downloading it, handle gracefully
- **Current Status**: ⚠️ Might download then delete, or skip naturally
- **Risk**: Low
- **Test Priority**: Low

### 13.3 User Navigates Away During Sync
- **Given**: Initial sync in progress on article list page
- **When**: User navigates to preferences page
- **Then**: Sync continues in background, UI shows progress globally
- **Current Status**: ⚠️ Sync continues, but progress UI only on article list page
- **Risk**: Low (cosmetic)
- **Test Priority**: Low

---

## 14. Data Migration & Maintenance

### 14.1 Clear Local Data & Re-sync
- **Given**: User wants to clear local IndexedDB and re-download everything
- **When**: User clicks "Clear local data" button
- **Then**: Wipe IndexedDB, trigger fresh initial sync
- **Current Status**: ⚠️ No UI for this, but could implement
- **Risk**: Low (feature request)
- **Test Priority**: Low

### 14.2 Force Full Re-sync
- **Given**: User suspects data desync (DB has wrong data)
- **When**: User clicks "Force re-sync"
- **Then**: Re-run `processMissingArticles()` and `processDeletedArticles()`
- **Current Status**: ✅ Manual sync button on diagnostics page does this
- **Risk**: Low
- **Test Priority**: Low (already exists)

### 14.3 Account Switching
- **Given**: User connected to Account A, wants to switch to Account B
- **When**: User disconnects A and connects B
- **Then**: Clear Account A data, sync Account B data
- **Current Status**: ❌ No explicit handling (data might mix)
- **Risk**: High (data leak between accounts)
- **Test Priority**: High

---

## 15. Performance Edge Cases

### 15.1 Very Large Article Count (5000+)
- **Given**: User has 5000 articles
- **When**: Reconnecting
- **Then**: Listing fetch and comparison should be performant
- **Current Status**: ⚠️ `processDeletedArticles()` iterates all, could be slow
- **Risk**: Medium
- **Test Priority**: Low (most users have <500)

### 15.2 Very Slow RemoteStorage Server
- **Given**: RemoteStorage server is very slow (500ms per request)
- **When**: Initial sync of 200 articles
- **Then**: Should still work, just take time, show accurate progress
- **Current Status**: ✅ Should work fine
- **Risk**: Low
- **Test Priority**: Low

### 15.3 Rapid Sync Cycles (Development Scenario)
- **Given**: Developer testing with multiple browsers/incognito tabs
- **When**: Making rapid changes and syncing across 5 tabs
- **Then**: All tabs stay in sync, no corruption
- **Current Status**: ⚠️ Untested with >2 browsers
- **Risk**: Medium
- **Test Priority**: Medium

---

## Priority Matrix

| Scenario | Risk | Likelihood | Test Priority | Implementation Priority |
|----------|------|------------|---------------|------------------------|
| **6.1** Simultaneous Updates | Low | Medium | Medium | Low (RS handles) |
| **6.2** Offline Edits Collision | Medium | Low | Low | Low |
| **7.4** Network Flip-Flop | Medium | Medium | Medium | Medium |
| **8.1** Multiple Tabs | Medium | High | **High** | **High** |
| **8.3** Bulk Operations | Medium | Medium | Medium | Medium |
| **9.2** Missing Required Fields | Medium | Low | Medium | Medium |
| **9.3** Schema Version Mismatch | High | Medium | **High** | **High** |
| **10.1** IndexedDB Quota | Medium | Medium | Medium | Medium |
| **11.1** Token Expiration | Medium | Low | Medium | Low (RS handles?) |
| **13.1** Add During Initial Sync | Low | High | Medium | Low (likely works) |
| **14.3** Account Switching | **High** | Medium | **High** | **High** |
| **15.1** Very Large Dataset | Medium | Low | Low | Low |

---

## Recommendations

### High Priority (Should Implement)
1. **Account Switching** (14.3) - Prevents data leaks
2. **Schema Version Mismatch** (9.3) - Critical for future updates
3. **Multiple Tabs** (8.1) - Common user pattern

### Medium Priority (Consider Implementing)
1. **Network Flip-Flop** (7.4) - Better UX
2. **Bulk Operations** (8.3) - Performance
3. **IndexedDB Quota** (10.1) - Power user issue

### Low Priority (Monitor)
1. Everything else - Most are either handled by RemoteStorage or rare edge cases

---

## Testing Strategy for Additional Scenarios

For high-priority scenarios, consider:

**Unit Tests** (where applicable):
- Schema migration logic
- Account switching cleanup logic
- Validation functions

**Integration Tests** (for complex scenarios):
- Multiple tabs (requires multi-browser Playwright test)
- Network flip-flop (requires network throttling)
- Bulk operations (simulate 50+ rapid changes)

**Manual Testing** (for rare scenarios):
- Very large datasets
- Slow servers
- Token expiration
