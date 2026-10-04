import { db } from "../db";
import type { FetchOutcome, OutcomeStore } from "./fetchGovernor";

/**
 * Dexie-backed implementation of the governor's `OutcomeStore` port. Kept in a
 * separate module so the governor itself stays dependency-free and testable.
 */
export function createDexieOutcomeStore(): OutcomeStore {
  return {
    async get(key: string): Promise<FetchOutcome | undefined> {
      return (await db.fetchCache.get(key)) as FetchOutcome | undefined;
    },
    async put(outcome: FetchOutcome): Promise<void> {
      await db.fetchCache.put(outcome);
    },
    async delete(key: string): Promise<void> {
      await db.fetchCache.delete(key);
    },
    async clear(): Promise<void> {
      await db.fetchCache.clear();
    },
  };
}
