// shared/gapDerive.ts — the Gaps tab's derived snapshot: the engine's rows with the three domains
// the renderer checks against the catalog joined in (factions, drops, images). It was inline in
// useGapsData's `useMemo`, so it reran on every visit: GapsView remounts on each tab switch, and a
// remount starts with an empty memo (perf audit, 2026-10-20: each Gaps visit 400–500 ms, as one
// long task). Pulled out here, it is pure and node-testable, and `lastGapsSnap` keeps the last
// answer across remounts while every input is the same object.

import type { GapsSnap } from './gaps'
import type { KillMap } from './kills'
import type { LootEvent } from './types'
import { withFactionRows } from './gapFactions'
import { withDropRows, type DropAliases, type DropGroups, type ItemMobs } from './gapDrops'
import { withImageRows, type ConMet } from './gapImages'
import { memoLast } from './gapMemo'
import type { MobEntry } from './mobTypes'

/** What the player did, as the modules serve it: loot lines, the kills ledger, /cons, and the item pages' mobs from main. */
export interface GapsMet {
  loot: readonly LootEvent[]
  kills: KillMap
  cons: readonly ConMet[]
  /** Absent until main has answered (gapItemMobs.ts). */
  itemMobs?: ItemMobs
}

/** The wiki data, fixed for the session: the mob catalog and dropGroups.json. */
export interface GapsWiki {
  catalog: readonly MobEntry[]
  groups: DropGroups
  aliases: DropAliases
}

/** The engine's snapshot with the faction, drop and image rows joined in and counted. */
export function deriveGaps(engine: GapsSnap, met: GapsMet, wiki: GapsWiki): GapsSnap {
  const withFactions = withFactionRows(engine, wiki.catalog, met.kills)
  const withDrops = withDropRows(withFactions, met.loot, { catalog: wiki.catalog, groups: wiki.groups, itemMobs: met.itemMobs, aliases: wiki.aliases })
  return withImageRows(withDrops, { kills: met.kills, loot: met.loot, cons: met.cons }, wiki.catalog)
}

/** The inputs' identities, in a fixed order: the cache key. */
const keyOf = (engine: GapsSnap, met: GapsMet, wiki: GapsWiki): readonly unknown[] => [engine, met.loot, met.kills, met.cons, met.itemMobs, wiki.catalog, wiki.groups, wiki.aliases]

/**
 * `deriveGaps` behind a one-entry cache, keyed by the IDENTITY of each input: the engine snapshot,
 * the loot, kills and cons (useModule hands back the same object until the module changes), the
 * item-page answer (the same map until main answers more), and the wiki's three tables. A revisit
 * with nothing new returns the last snapshot itself. A caller must pass stable objects: a fresh
 * `?? []` per render misses every time. An option added to the derivation joins the key.
 */
export function lastGapsSnap(): (engine: GapsSnap, met: GapsMet, wiki: GapsWiki) => GapsSnap {
  const last = memoLast<GapsSnap>()
  return (engine, met, wiki) => last(keyOf(engine, met, wiki), () => deriveGaps(engine, met, wiki))
}
