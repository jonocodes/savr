# Article Sync Testing Strategy

This document outlines a unit testing approach for the article sync logic to enable fast regression testing without requiring full end-to-end Playwright tests.

## Testing Approach

### What to Test

The sync logic consists of:
1. **Change event handler** - Determines if event is addition, update, or deletion
2. **processMissingArticles()** - Handles catchup additions
3. **processDeletedArticles()** - Handles catchup deletions
4. **Progress tracking** - Updates sync progress correctly

### Challenges

- RemoteStorage client is external library
- IndexedDB (Dexie) requires async operations
- Logic is tightly coupled to storage.ts module state
- Many functions are not exported

### Proposed Solution: Extract Testable Logic

**Option 1: Refactor for Testability** (Recommended)

Extract core logic into pure functions that can be tested independently:

```typescript
// New file: src/utils/syncLogic.ts

export interface SyncEvent {
  path: string;
  oldValue: any;
  newValue: any;
}

export interface Article {
  slug: string;
  archived?: boolean;
  // ... other fields
}

/**
 * Determines the action to take for a change event
 */
export function determineSyncAction(
  event: SyncEvent,
  existingArticle: Article | null,
  alreadyProcessed: boolean
): 'add' | 'update' | 'delete' | 'skip' {
  // Deletion
  if (event.oldValue !== undefined && event.newValue === undefined) {
    return 'delete';
  }

  // Addition or Update
  if (event.newValue !== undefined) {
    // Update detection: either in RS cache or in IndexedDB
    const isUpdate = event.oldValue !== undefined || existingArticle !== null;

    // New addition - skip if already processed
    if (!isUpdate && alreadyProcessed) {
      return 'skip';
    }

    // New addition - skip if somehow already exists
    if (!isUpdate && existingArticle) {
      return 'skip';
    }

    // Determine if update or add
    return isUpdate ? 'update' : 'add';
  }

  return 'skip';
}

/**
 * Identifies articles to delete (in DB but not in listing)
 */
export function identifyDeletedArticles(
  localArticles: Article[],
  remoteSlugs: Set<string>
): string[] {
  return localArticles
    .filter(article => !remoteSlugs.has(article.slug))
    .map(article => article.slug);
}

/**
 * Identifies articles to add (in listing but not in DB)
 */
export function identifyMissingArticles(
  remoteSlugs: string[],
  localArticles: Article[],
  alreadyProcessed: Set<string>
): string[] {
  const localSlugs = new Set(localArticles.map(a => a.slug));
  return remoteSlugs.filter(slug =>
    !localSlugs.has(slug) && !alreadyProcessed.has(`saves/${slug}/article.json`)
  );
}
```

**Option 2: Mock Dependencies** (Faster to implement)

Create mocks for RemoteStorage and Dexie, test existing functions:

```typescript
// src/utils/__mocks__/remoteStorage.ts
// src/utils/__mocks__/dexie.ts
```

**Option 3: Integration Tests with In-Memory DB** (More realistic)

Use an in-memory IndexedDB implementation (fake-indexeddb) and mock only RemoteStorage.

## Recommended Test Structure

```
src/utils/
  syncLogic.ts          # Pure functions (extracted logic)
  syncLogic.test.ts     # Unit tests
  storage.ts            # Integration with RS/DB
  storage.test.ts       # Integration tests (optional)
```

## Sample Unit Tests

### Test: determineSyncAction()

```typescript
describe('determineSyncAction', () => {
  describe('deletions', () => {
    it('should return delete when oldValue exists and newValue is undefined', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: { slug: 'article-1' },
        newValue: undefined
      };
      expect(determineSyncAction(event, null, false)).toBe('delete');
    });
  });

  describe('updates', () => {
    it('should return update when both oldValue and newValue exist', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: { slug: 'article-1', archived: false },
        newValue: { slug: 'article-1', archived: true }
      };
      expect(determineSyncAction(event, null, false)).toBe('update');
    });

    it('should return update when newValue exists and article exists in DB (reopened browser)', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: undefined, // Not in RS cache
        newValue: { slug: 'article-1', archived: true }
      };
      const existingArticle = { slug: 'article-1', archived: false };
      expect(determineSyncAction(event, existingArticle, false)).toBe('update');
    });
  });

  describe('additions', () => {
    it('should return add for new article not in DB', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: undefined,
        newValue: { slug: 'article-1' }
      };
      expect(determineSyncAction(event, null, false)).toBe('add');
    });

    it('should return skip if already processed', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: undefined,
        newValue: { slug: 'article-1' }
      };
      expect(determineSyncAction(event, null, true)).toBe('skip');
    });

    it('should return skip if already exists in DB', () => {
      const event = {
        path: 'saves/article-1/article.json',
        oldValue: undefined,
        newValue: { slug: 'article-1' }
      };
      const existingArticle = { slug: 'article-1', archived: false };
      expect(determineSyncAction(event, existingArticle, false)).toBe('skip');
    });
  });
});
```

### Test: identifyDeletedArticles()

```typescript
describe('identifyDeletedArticles', () => {
  it('should identify articles in DB but not in remote listing', () => {
    const localArticles = [
      { slug: 'article-1', archived: false },
      { slug: 'article-2', archived: false },
      { slug: 'article-3', archived: false }
    ];
    const remoteSlugs = new Set(['article-1', 'article-3']);

    const result = identifyDeletedArticles(localArticles, remoteSlugs);
    expect(result).toEqual(['article-2']);
  });

  it('should return empty array when all local articles exist remotely', () => {
    const localArticles = [
      { slug: 'article-1', archived: false },
      { slug: 'article-2', archived: false }
    ];
    const remoteSlugs = new Set(['article-1', 'article-2', 'article-3']);

    const result = identifyDeletedArticles(localArticles, remoteSlugs);
    expect(result).toEqual([]);
  });
});
```

### Test: identifyMissingArticles()

```typescript
describe('identifyMissingArticles', () => {
  it('should identify articles in remote listing but not in DB', () => {
    const remoteSlugs = ['article-1', 'article-2', 'article-3'];
    const localArticles = [
      { slug: 'article-1', archived: false }
    ];
    const alreadyProcessed = new Set<string>();

    const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
    expect(result).toEqual(['article-2', 'article-3']);
  });

  it('should skip articles already processed this session', () => {
    const remoteSlugs = ['article-1', 'article-2', 'article-3'];
    const localArticles = [
      { slug: 'article-1', archived: false }
    ];
    const alreadyProcessed = new Set(['saves/article-2/article.json']);

    const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
    expect(result).toEqual(['article-3']);
  });
});
```

## Test Coverage Goals

### Critical Paths (Must Test)
- ✅ Update detection when browser was open (oldValue exists)
- ✅ Update detection when browser was closed (oldValue undefined, article in DB)
- ✅ Addition when article doesn't exist
- ✅ Deletion when oldValue exists
- ✅ Catchup deletion (article in DB but not in listing)
- ✅ Catchup addition (article in listing but not in DB)
- ✅ Duplicate prevention for additions
- ✅ Always process updates (no duplicate prevention)

### Important Paths (Should Test)
- Progress tracking with initial sync vs subsequent sync
- Handling dangling articles (directories without article.json)
- Multiple changes while browser closed

### Nice to Have
- Performance with large datasets (100+ articles)
- Concurrent sync operations
- Network error handling

## Implementation Steps

1. **Extract pure functions** from storage.ts into new syncLogic.ts
2. **Write unit tests** for extracted functions
3. **Update storage.ts** to use extracted functions
4. **Verify** all scenarios still work (manual testing)
5. **Run tests** on every PR to catch regressions

## Running Tests

```bash
# Run all tests
npm test

# Run only sync tests
npm test -- syncLogic.test.ts

# Run with coverage
npm test -- --coverage
```

## Benefits

- **Fast**: Unit tests run in milliseconds
- **Isolated**: No RemoteStorage or network required
- **Comprehensive**: Cover all scenarios systematically
- **Regression prevention**: Catch bugs before deployment
- **Documentation**: Tests serve as living documentation

## Next Steps

Would you like me to:
1. Implement the refactoring to extract testable functions?
2. Create the test file with full coverage?
3. Set up the test infrastructure (Jest/Vitest config)?
