/**
 * Unit tests for article sync logic
 *
 * These tests cover all sync scenarios documented in SYNC_SCENARIOS.md
 */

import {
  determineSyncAction,
  identifyDeletedArticles,
  identifyMissingArticles,
  extractSlugFromPath,
  isInitialSync,
  calculateProgressTotal,
  SyncEvent,
  Article,
} from './syncLogic';

describe('syncLogic', () => {
  describe('determineSyncAction', () => {
    describe('deletions', () => {
      it('should return delete when oldValue exists and newValue is undefined', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1' },
          newValue: undefined,
        };
        expect(determineSyncAction(event, null, false)).toBe('delete');
      });

      it('should return delete even if article exists in DB', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1' },
          newValue: undefined,
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };
        expect(determineSyncAction(event, existingArticle, false)).toBe('delete');
      });

      it('should return delete even if already processed', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1' },
          newValue: undefined,
        };
        expect(determineSyncAction(event, null, true)).toBe('delete');
      });
    });

    describe('updates - browser open (oldValue exists)', () => {
      it('should return update when both oldValue and newValue exist', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1', archived: false },
          newValue: { slug: 'article-1', archived: true },
        };
        expect(determineSyncAction(event, null, false)).toBe('update');
      });

      it('should return update even if article exists in DB', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1', archived: false },
          newValue: { slug: 'article-1', archived: true },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };
        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });

      it('should return update even if already processed (updates always process)', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1', archived: false },
          newValue: { slug: 'article-1', archived: true },
        };
        expect(determineSyncAction(event, null, true)).toBe('update');
      });
    });

    describe('updates - browser reopened (oldValue undefined, article in DB)', () => {
      it('should return update when newValue exists and article exists in DB (reopened browser)', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined, // Not in RemoteStorage cache
          newValue: { slug: 'article-1', archived: true },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };
        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });

      it('should return update for archived article even if already processed', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1', archived: true },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };
        expect(determineSyncAction(event, existingArticle, true)).toBe('update');
      });

      it('should handle unarchive as update', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1', archived: false },
        };
        const existingArticle: Article = { slug: 'article-1', archived: true };
        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });
    });

    describe('additions - new articles', () => {
      it('should return add for new article not in DB', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1' },
        };
        expect(determineSyncAction(event, null, false)).toBe('add');
      });

      it('should return skip if already processed this session', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1' },
        };
        expect(determineSyncAction(event, null, true)).toBe('skip');
      });

      it('should return update if article already exists in DB (reopened browser case)', () => {
        // This scenario happens when browser reopens and receives change event for existing article
        // Could be an update made while browser was closed, so treat as update
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1' },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };
        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });
    });

    describe('edge cases', () => {
      it('should return skip when both oldValue and newValue are undefined', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: undefined,
        };
        expect(determineSyncAction(event, null, false)).toBe('skip');
      });
    });
  });

  describe('identifyDeletedArticles', () => {
    it('should identify articles in DB but not in remote listing', () => {
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: false },
        { slug: 'article-3', archived: false },
      ];
      const remoteSlugs = new Set(['article-1', 'article-3']);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual(['article-2']);
    });

    it('should return empty array when all local articles exist remotely', () => {
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: false },
      ];
      const remoteSlugs = new Set(['article-1', 'article-2', 'article-3']);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual([]);
    });

    it('should identify multiple deleted articles', () => {
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: false },
        { slug: 'article-3', archived: false },
        { slug: 'article-4', archived: false },
        { slug: 'article-5', archived: false },
      ];
      const remoteSlugs = new Set(['article-1', 'article-5']);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual(['article-2', 'article-3', 'article-4']);
    });

    it('should return empty array for empty local DB', () => {
      const localArticles: Article[] = [];
      const remoteSlugs = new Set(['article-1', 'article-2']);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual([]);
    });

    it('should identify all articles when remote is empty', () => {
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: false },
      ];
      const remoteSlugs = new Set<string>([]);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual(['article-1', 'article-2']);
    });

    it('should handle archived and non-archived articles equally', () => {
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: true },
        { slug: 'article-3', archived: false },
      ];
      const remoteSlugs = new Set(['article-1']);

      const result = identifyDeletedArticles(localArticles, remoteSlugs);
      expect(result).toEqual(['article-2', 'article-3']);
    });
  });

  describe('identifyMissingArticles', () => {
    it('should identify articles in remote listing but not in DB', () => {
      const remoteSlugs = ['article-1', 'article-2', 'article-3'];
      const localArticles: Article[] = [{ slug: 'article-1', archived: false }];
      const alreadyProcessed = new Set<string>();

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual(['article-2', 'article-3']);
    });

    it('should skip articles already processed this session', () => {
      const remoteSlugs = ['article-1', 'article-2', 'article-3'];
      const localArticles: Article[] = [{ slug: 'article-1', archived: false }];
      const alreadyProcessed = new Set(['saves/article-2/article.json']);

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual(['article-3']);
    });

    it('should return empty array when all remote articles exist locally', () => {
      const remoteSlugs = ['article-1', 'article-2'];
      const localArticles: Article[] = [
        { slug: 'article-1', archived: false },
        { slug: 'article-2', archived: false },
        { slug: 'article-3', archived: false },
      ];
      const alreadyProcessed = new Set<string>();

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual([]);
    });

    it('should identify all remote articles when DB is empty', () => {
      const remoteSlugs = ['article-1', 'article-2', 'article-3'];
      const localArticles: Article[] = [];
      const alreadyProcessed = new Set<string>();

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual(['article-1', 'article-2', 'article-3']);
    });

    it('should handle multiple already-processed articles', () => {
      const remoteSlugs = ['article-1', 'article-2', 'article-3', 'article-4'];
      const localArticles: Article[] = [];
      const alreadyProcessed = new Set([
        'saves/article-1/article.json',
        'saves/article-3/article.json',
      ]);

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual(['article-2', 'article-4']);
    });

    it('should return empty array for empty remote listing', () => {
      const remoteSlugs: string[] = [];
      const localArticles: Article[] = [{ slug: 'article-1', archived: false }];
      const alreadyProcessed = new Set<string>();

      const result = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
      expect(result).toEqual([]);
    });
  });

  describe('extractSlugFromPath', () => {
    it('should extract slug from valid article path', () => {
      expect(extractSlugFromPath('saves/article-1/article.json')).toBe('article-1');
    });

    it('should extract slug with hyphens and numbers', () => {
      expect(extractSlugFromPath('saves/my-article-123/article.json')).toBe('my-article-123');
    });

    it('should return null for invalid paths', () => {
      expect(extractSlugFromPath('saves/article-1/image.jpg')).toBeNull();
      expect(extractSlugFromPath('saves/article-1/')).toBeNull();
      expect(extractSlugFromPath('article-1/article.json')).toBeNull();
      expect(extractSlugFromPath('saves/article.json')).toBeNull();
    });

    it('should handle URL-encoded slugs', () => {
      expect(extractSlugFromPath('saves/article%20with%20spaces/article.json')).toBe('article%20with%20spaces');
    });
  });

  describe('isInitialSync', () => {
    it('should return true for empty database', () => {
      expect(isInitialSync(0)).toBe(true);
    });

    it('should return false for non-empty database', () => {
      expect(isInitialSync(1)).toBe(false);
      expect(isInitialSync(100)).toBe(false);
      expect(isInitialSync(1000)).toBe(false);
    });
  });

  describe('calculateProgressTotal', () => {
    it('should use listing count for initial sync', () => {
      const isInitial = true;
      const listingCount = 192;
      const dbCount = 36;

      expect(calculateProgressTotal(isInitial, listingCount, dbCount)).toBe(192);
    });

    it('should use DB count for subsequent sync', () => {
      const isInitial = false;
      const listingCount = 192;
      const dbCount = 178;

      expect(calculateProgressTotal(isInitial, listingCount, dbCount)).toBe(178);
    });

    it('should handle zero counts', () => {
      expect(calculateProgressTotal(true, 0, 0)).toBe(0);
      expect(calculateProgressTotal(false, 100, 0)).toBe(0);
    });

    it('should handle mismatched counts (dangling articles scenario)', () => {
      // Listing has 192 but DB only has 178 (14 dangling)
      const isInitial = false;
      const listingCount = 192;
      const dbCount = 178;

      // Should use DB count to ignore dangling
      expect(calculateProgressTotal(isInitial, listingCount, dbCount)).toBe(178);
    });
  });

  describe('integration scenarios from SYNC_SCENARIOS.md', () => {
    describe('Scenario 1.2: Article Update (Archive/Unarchive) - Both browsers open', () => {
      it('should process archive update when browser was open', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: { slug: 'article-1', archived: false },
          newValue: { slug: 'article-1', archived: true },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };

        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });
    });

    describe('Scenario 2.2: Article Update While Closed', () => {
      it('should process archive update when browser was closed and reopened', () => {
        const event: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined, // Browser was closed, not in cache
          newValue: { slug: 'article-1', archived: true },
        };
        const existingArticle: Article = { slug: 'article-1', archived: false };

        expect(determineSyncAction(event, existingArticle, false)).toBe('update');
      });
    });

    describe('Scenario 2.3: Article Deletion While Closed', () => {
      it('should identify articles deleted while browser was closed', () => {
        // Browser B had articles 1, 2, 3
        const localArticles: Article[] = [
          { slug: 'article-1', archived: false },
          { slug: 'article-2', archived: false },
          { slug: 'article-3', archived: false },
        ];

        // Browser A deleted article-2, remote now has 1 and 3
        const remoteSlugs = new Set(['article-1', 'article-3']);

        const toDelete = identifyDeletedArticles(localArticles, remoteSlugs);
        expect(toDelete).toEqual(['article-2']);
      });
    });

    describe('Scenario 5.3: Multiple Changes While Closed', () => {
      it('should handle multiple additions while browser was closed', () => {
        const remoteSlugs = ['article-1', 'article-2', 'article-3', 'article-4', 'article-5'];
        const localArticles: Article[] = []; // Browser just reopened
        const alreadyProcessed = new Set<string>();

        const toAdd = identifyMissingArticles(remoteSlugs, localArticles, alreadyProcessed);
        expect(toAdd.length).toBe(5);
        expect(toAdd).toEqual(['article-1', 'article-2', 'article-3', 'article-4', 'article-5']);
      });

      it('should handle multiple deletions while browser was closed', () => {
        const localArticles: Article[] = [
          { slug: 'article-1', archived: false },
          { slug: 'article-2', archived: false },
          { slug: 'article-3', archived: false },
          { slug: 'article-4', archived: false },
          { slug: 'article-5', archived: false },
        ];
        const remoteSlugs = new Set(['article-1', 'article-4']); // 2, 3, 5 deleted

        const toDelete = identifyDeletedArticles(localArticles, remoteSlugs);
        expect(toDelete.length).toBe(3);
        expect(toDelete).toEqual(['article-2', 'article-3', 'article-5']);
      });

      it('should handle combination: add 5, delete 2, update 3', () => {
        // Starting state: Browser B has articles 1-10
        const localArticles: Article[] = Array.from({ length: 10 }, (_, i) => ({
          slug: `article-${i + 1}`,
          archived: false,
        }));

        // Remote state after changes:
        // - Deleted: 2, 5
        // - Added: 11, 12, 13, 14, 15
        // - Updated: 1, 3, 7 (archived)
        const remoteSlugs = new Set([
          'article-1',
          // 'article-2' deleted
          'article-3',
          'article-4',
          // 'article-5' deleted
          'article-6',
          'article-7',
          'article-8',
          'article-9',
          'article-10',
          'article-11', // new
          'article-12', // new
          'article-13', // new
          'article-14', // new
          'article-15', // new
        ]);

        const toDelete = identifyDeletedArticles(localArticles, remoteSlugs);
        expect(toDelete).toEqual(['article-2', 'article-5']);

        const toAdd = identifyMissingArticles(
          Array.from(remoteSlugs),
          localArticles,
          new Set()
        );
        expect(toAdd).toEqual(['article-11', 'article-12', 'article-13', 'article-14', 'article-15']);

        // For updates, simulate change events
        const update1: SyncEvent = {
          path: 'saves/article-1/article.json',
          oldValue: undefined,
          newValue: { slug: 'article-1', archived: true },
        };
        expect(
          determineSyncAction(update1, { slug: 'article-1', archived: false }, false)
        ).toBe('update');
      });
    });
  });
});
