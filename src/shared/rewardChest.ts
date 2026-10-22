// shared/rewardChest.ts — the Reward Chest a Dungeon Crawl pays out of (a loot line's `source:
// "Reward Chest"`). It is no mob, and what it pays is no mob's drop: it can pay any item of any mob
// the crawl killed (owner, 2026-10-21). The item still counts as looted; only the source goes.
// Byte-identical on every branch that reads it (catch_all, log-archive, gaps-tab).

/** The loot source is the chest, not a mob. */
export const isRewardChest = (source: string | undefined): boolean => source?.trim().toLowerCase() === 'reward chest'

/** The mob a loot line names: none for no source or for the chest. */
export const mobSourceOf = (e: { source?: string }): string | undefined => (isRewardChest(e.source) ? undefined : e.source)
