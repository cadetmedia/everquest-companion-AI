// useGapsData — everything the Gaps tab reads, joined once: the engine's rows, the derived domains
// (factions, drops, images) checked against the catalog here, and what the page builders need beside
// them (the wiki's zone spellings, which names are catalog mobs, the data's date).
//
// KEPT ACROSS REMOUNTS (perf audit, 2026-10-20: each Gaps visit 400–500 ms, as one long task):
// GapsView remounts on every tab switch and a `useMemo` starts empty on a mount, so each visit
// re-derived everything. The derivation now sits behind module-level one-entry caches keyed by its
// inputs' identities (gapDerive.ts `lastGapsSnap`, gapMemo.ts `memoLast`); useModule hands back the
// same object until a module changes, so a revisit with nothing new costs a key compare. That is
// why every `?? []` / `?? {}` below falls back to a module constant, never a fresh literal.

import { useDeferredValue, useMemo } from 'react'
import type { GapsSnap } from '@shared/gaps'
import { GAPS_MODULE_ID } from '@shared/gaps'
import type { ConsiderSnap, LootSnap } from '@shared/types'
import { killIndex, type KillMap, type KillsSnap } from '@shared/kills'
import { lootedItemNames, type DropAliases, type DropGroups } from '@shared/gapDrops'
import { lastGapsSnap, type GapsWiki } from '@shared/gapDerive'
import { memoLast } from '@shared/gapMemo'
import { catalogNameTest, commonLootNames, vendorFinder } from '@shared/gapMobPage'
import { catalogZoneCounts, wikiZoneNamer } from '@shared/gapWikiZone'
import type { PageExtras, ZoneNamer } from '@shared/wikiPage'
import dropGroupsJson from '../../data/eqlegends/dropGroups.json'
import mobsJson from '../../data/eqlegends/mobs.json'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { gapsSince, joinCharacters, otherInputs, ownSince, type CharacterGaps, type OwnGaps } from '@shared/gapsAllCharacters'
import { useModule } from '../../lib/useModule'
import { useItemMobs } from '../../lib/gapItemMobs'

/** Each drop group's members, and the drop-list links that redirect to an item (scrape-drop-groups.ts). */
const DROPS = dropGroupsJson as { groups: DropGroups; aliases?: DropAliases }
/** The wiki data's date, `2026-10-19`: the chips' tooltips and the tab's caption say it. */
export const GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)

const ZONE_NAME: ZoneNamer = wikiZoneNamer(catalogZoneCounts(MOB_CATALOG))
const IS_MOB = catalogNameTest(MOB_CATALOG)
export const PAGE_EXTRAS: PageExtras = { zoneName: ZONE_NAME, isMob: IS_MOB, commonLoot: commonLootNames(MOB_CATALOG), vendorAt: vendorFinder(MOB_CATALOG) }

/** The wiki side, one object for the session: the caches key on it. */
const WIKI: GapsWiki = { catalog: MOB_CATALOG, groups: DROPS.groups, aliases: DROPS.aliases ?? {} }
/** The fallbacks before a module has state: one object each, so a cache key stays the same. */
const NO_LOOT: LootSnap = []
const NO_KILLS: KillMap = {}
const NO_CONS: ConsiderSnap = []
const snapOf = lastGapsSnap()
const lastLooted = memoLast<string[]>()
const lastKills = memoLast<KillMap>()
const lastOwnCut = memoLast<OwnGaps>()
const lastShown = memoLast<GapsSnap | null | undefined>()

export interface GapsData {
  /** The engine's snapshot with the derived domains joined in; undefined until it lands. */
  snap: GapsSnap | null | undefined
  /** The engine's own snapshot: its kill factions and mob points feed the pages. */
  engine: GapsSnap | null | undefined
  loot: LootSnap
  /** The attached character's own loot, never joined: what it holds is its own export plus this. */
  ownLoot: LootSnap
  kills: KillMap
  /** All characters: `domain|name` lower-cased -> who saw it; undefined in the one-character view. */
  seenBy?: ReadonlyMap<string, readonly string[]>
  /** All characters: the join is still being worked on; the list shows the last one meanwhile. */
  joining: boolean
}

/** All characters ticked: the others' inputs, the attached one's label, and the day window. */
export interface AllCharacters {
  others: readonly CharacterGaps[]
  liveLabel: string
  cut: { stamp: string; ms: number }
}

/** How the list is built. */
export interface GapsDataOptions {
  /** The day window (owner, 2026-10-21: every view, not only All characters); none when absent. */
  cut?: { stamp: string; ms: number } | null
}

/**
 * What the derivation reads for the attached character alone, cut to the day window when one is
 * given. Kept across the tab's remounts while the inputs are the same objects: a cut builds new
 * arrays, and a new array would miss every derivation cache keyed on it.
 */
function ownInputs(engine: GapsSnap | null | undefined, loot: LootSnap, kills: KillsSnap | null | undefined, cut: { stamp: string; ms: number } | null): { engine: GapsSnap | null | undefined; loot: LootSnap; killMobs: KillMap } {
  if (engine == null || cut === null) return { engine, loot, killMobs: kills?.mobs ?? NO_KILLS }
  const own = lastOwnCut([engine, loot, kills, cut.stamp], () => ownSince({ gaps: engine, loot, kills: kills ?? null }, cut))
  return { engine: own.gaps, loot: own.loot, killMobs: own.kills?.mobs ?? NO_KILLS }
}

/** The rows the day window keeps: it chooses rows only, each derived from whole loot and kills (ownSince). */
function inWindow(snap: GapsSnap | null | undefined, cut: { stamp: string } | null | undefined): GapsSnap | null | undefined {
  return lastShown([snap, cut?.stamp], () => (snap && cut ? gapsSince(snap, cut.stamp) : snap))
}

export function useGapsData(all: AllCharacters | null = null, opts: GapsDataOptions = {}): GapsData {
  const liveEngine = useModule<GapsSnap>(GAPS_MODULE_ID)
  const liveLoot = useModule<LootSnap>('loot') ?? NO_LOOT
  const liveKills = useModule<KillsSnap>('kills')
  const cons = useModule<ConsiderSnap>('consider') ?? NO_CONS
  // The join runs a beat behind the box, so the tab stays live and can say it is working (owner, 2026-10-19).
  const deferredAll = useDeferredValue(all)
  // All characters (owner, 2026-10-19): the attached character's live inputs joined with every other
  // character's saved ones, each one's rows cut to the day window (loot and kills join whole).
  const joined = useMemo(() => {
    if (deferredAll === null || liveEngine == null) return null
    const live = { label: deferredAll.liveLabel, gaps: liveEngine, loot: liveLoot, kills: liveKills ?? null }
    return joinCharacters([live, ...otherInputs(deferredAll.others, IS_MOB)], deferredAll.cut)
  }, [deferredAll, liveEngine, liveLoot, liveKills])
  const { engine, loot, killMobs } =
    joined === null ? ownInputs(liveEngine, liveLoot, liveKills, opts.cut ?? null) : { engine: joined.gaps, loot: joined.loot, killMobs: joined.kills?.mobs ?? NO_KILLS }
  // The item pages' side of each drop, asked of main (the corpus is main-only). The same array while
  // the loot is the same, so useItemMobs' effect does not rerun on a remount.
  const looted = lastLooted([loot], () => lootedItemNames(loot))
  const itemMobs = useItemMobs(looted)
  const snap = useMemo(() => (engine ? snapOf(engine, { loot, kills: killMobs, cons, itemMobs }, WIKI) : engine), [engine, loot, killMobs, itemMobs, cons])
  const kills = lastKills([killMobs], () => killIndex(killMobs))
  return { snap: inWindow(snap, joined === null ? opts.cut : deferredAll?.cut), engine, loot, ownLoot: liveLoot, kills, seenBy: joined?.seenBy, joining: all !== deferredAll }
}
