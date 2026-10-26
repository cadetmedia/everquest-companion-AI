// shared/gapDerive.ts — the Gaps tab's derived snapshot: the engine's rows with the domains the
// renderer checks against the catalog joined in (factions, drops, images, respawns). It was inline in
// useGapsData's `useMemo`, so it reran on every visit: GapsView remounts on each tab switch, and a
// remount starts with an empty memo (perf audit, 2026-10-20: each Gaps visit 400–500 ms, as one
// long task). Pulled out here, it is pure and node-testable, and `lastGapsSnap` keeps the last
// answer across remounts while every input is the same object.

import type { GapDomain, GapsSnap } from './gaps'
import type { KillMap } from './kills'
import type { LootEvent } from './types'
import { withFactionRows } from './gapFactions'
import { withDropRows, type DropAliases, type DropGroups, type ItemMobs } from './gapDrops'
import { withImageRows, type ConMet } from './gapImages'
import { withForageRows, type ItemForage } from './gapForage'
import { memoLast } from './gapMemo'
import { withLearnedRespawn, withRespawnRows } from './gapRespawns'
import type { MobEntry } from './mobTypes'
import { learnedOf } from './respawnLearn'

/** What the player did, as the modules serve it: loot lines, the kills ledger, /cons, and the item pages' mobs from main. */
export interface GapsMet {
  loot: readonly LootEvent[]
  kills: KillMap
  cons: readonly ConMet[]
  /** Absent until main has answered (gapItemMobs.ts). */
  itemMobs?: ItemMobs
  /** What each foraged item's own page states of foraging; absent until main has answered (gapForage.ts). */
  itemForage?: ItemForage
  /** The respawn module's snapshot: its learned gaps give the Respawns rows (gapRespawns.ts). */
  respawn?: unknown
}

/** The wiki data, fixed for the session: the mob catalog and dropGroups.json. */
export interface GapsWiki {
  catalog: readonly MobEntry[]
  groups: DropGroups
  aliases: DropAliases
}

/**
 * The engine's snapshot with the faction, drop, image and respawn rows joined in and counted. `only`
 * (the Wiki Gaps overlay's background copy, which shows one domain) derives that domain alone; the
 * others are left out, not empty-counted. The forage rows always run: they also remove the
 * engine's hidden `forage` rows. The respawn evidence also gives a new mob page its respawn_time, so
 * Mobs takes it too.
 */
export function deriveGaps(engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain): GapsSnap {
  const wants = (d: GapDomain): boolean => only === undefined || only === d
  const withFactions = wants('faction') ? withFactionRows(engine, wiki.catalog, met.kills) : engine
  const withDrops = wants('drop')
    ? withDropRows(withFactions, met.loot, { catalog: wiki.catalog, groups: wiki.groups, itemMobs: met.itemMobs, aliases: wiki.aliases })
    : withFactions
  const withForage = withForageRows(withDrops, met.itemForage, wiki.catalog)
  const withImages = wants('image') ? withImageRows(withForage, { kills: met.kills, loot: met.loot, cons: met.cons }, wiki.catalog) : withForage
  const learned = learnedOf(met.respawn)
  if (wants('respawn')) return withRespawnRows(withImages, learned, wiki.catalog)
  return wants('mob') && learned.length > 0 ? { ...withImages, rows: withImages.rows.map((r) => withLearnedRespawn(r, learned)) } : withImages
}

/** The inputs' identities, in a fixed order: the cache key. */
const keyOf = (engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain): readonly unknown[] => [engine, met.loot, met.kills, met.cons, met.itemMobs, met.itemForage, met.respawn, wiki.catalog, wiki.groups, wiki.aliases, only]

/**
 * `deriveGaps` behind a one-entry cache, keyed by the IDENTITY of each input: the engine snapshot,
 * the loot, kills and cons (useModule hands back the same object until the module changes), the
 * item-page answer (the same map until main answers more), and the wiki's three tables. A revisit
 * with nothing new returns the last snapshot itself. A caller must pass stable objects: a fresh
 * `?? []` per render misses every time. An option added to the derivation joins the key.
 */
export function lastGapsSnap(): (engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain) => GapsSnap {
  const last = memoLast<GapsSnap>()
  return (engine, met, wiki, only) => last(keyOf(engine, met, wiki, only), () => deriveGaps(engine, met, wiki, only))
}
