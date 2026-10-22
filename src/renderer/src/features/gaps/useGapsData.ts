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
import type { GapDomain, GapsSnap } from '@shared/gaps'
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
import { joinCharacters, otherInputs, type CharacterGaps, type JoinedGaps } from '@shared/gapsAllCharacters'
import { useModule } from '../../lib/useModule'
import { useItemMobs } from '../../lib/gapItemMobs'
import { useThrottled } from '../../lib/useThrottled'
import { useItemForage } from '../../lib/gapItemForage'
import { forageProofNames } from '@shared/gapForage'

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
const snapOfOnly = lastGapsSnap()
const lastLooted = memoLast<readonly string[]>()
const lastForaged = memoLast<string[]>()
const lastKills = memoLast<KillMap>()

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

const NO_NAMES: readonly string[] = []

/** How the list is built when nobody is looking at it (the Wiki Gaps overlay's publisher). */
export interface GapsDataOptions {
  /** Derive only this domain's rows (the overlay shows one domain); every domain when absent. */
  only?: GapDomain
  /** Take the game's new data at most this often, in ms; 0 (the tab) takes every push. */
  holdMs?: number
}

/**
 * The four feeds, held together on one clock when `holdMs` is set (owner, 2026-10-20: the
 * overlay's background copy re-derived the whole list on every kill, loot and /con, and every tab
 * click in the app waited behind it). The fallbacks are module constants, so the caches keyed on
 * these objects keep hitting across remounts.
 */
function useGapsFeeds(holdMs: number): { engine: GapsSnap | null; loot: LootSnap; kills: KillsSnap | null; cons: ConsiderSnap } {
  const fed = {
    engine: useModule<GapsSnap>(GAPS_MODULE_ID),
    loot: useModule<LootSnap>('loot') ?? NO_LOOT,
    kills: useModule<KillsSnap>('kills'),
    cons: useModule<ConsiderSnap>('consider') ?? NO_CONS
  }
  const fresh = useMemo(() => fed, [fed.engine, fed.loot, fed.kills, fed.cons]) // eslint-disable-line react-hooks/exhaustive-deps
  return useThrottled(fresh, holdMs)
}

/** What the derivation reads for the attached character alone. */
function ownInputs(engine: GapsSnap | null, loot: LootSnap, kills: KillsSnap | null): { engine: GapsSnap | null; loot: LootSnap; killMobs: KillMap } {
  return { engine, loot, killMobs: kills?.mobs ?? NO_KILLS }
}

/** What the derivation reads with All characters joined. */
function joinedInputs(joined: JoinedGaps): { engine: GapsSnap | null; loot: LootSnap; killMobs: KillMap } {
  return { engine: joined.gaps, loot: joined.loot, killMobs: joined.kills?.mobs ?? NO_KILLS }
}

export function useGapsData(all: AllCharacters | null = null, opts: GapsDataOptions = {}): GapsData {
  const { only, holdMs = 0 } = opts
  const { engine: liveEngine, loot: liveLoot, kills: liveKills, cons } = useGapsFeeds(holdMs)
  // The join runs a beat behind the box, so the tab stays live and can say it is working (owner, 2026-10-19).
  const deferredAll = useDeferredValue(all)
  // All characters (owner, 2026-10-19): the attached character's live inputs joined with every other
  // character's saved ones, each cut to the day window, before anything is derived from them.
  const joined = useMemo(() => {
    if (deferredAll === null || liveEngine == null) return null
    const live = { label: deferredAll.liveLabel, gaps: liveEngine, loot: liveLoot, kills: liveKills ?? null }
    return joinCharacters([live, ...otherInputs(deferredAll.others, IS_MOB)], deferredAll.cut)
  }, [deferredAll, liveEngine, liveLoot, liveKills])
  const { engine, loot, killMobs } = joined === null ? ownInputs(liveEngine, liveLoot, liveKills) : joinedInputs(joined)
  // The item pages' side of each drop, asked of main (the corpus is main-only), and only when Drops
  // is derived. The same array while the loot is the same, so useItemMobs' effect does not rerun.
  const wantDrops = only === undefined || only === 'drop'
  const looted = lastLooted([loot, wantDrops], () => (wantDrops ? lootedItemNames(loot) : NO_NAMES))
  const itemMobs = useItemMobs(looted)
  // The foraged known items' own pages, asked of main the same way (shared/gapForage.ts).
  const foraged = lastForaged([engine], () => (engine ? forageProofNames(engine) : []))
  const itemForage = useItemForage(foraged)
  // The overlay's one-domain copy keeps its own cache slot, so it and the tab never evict each other.
  const derive = only === undefined ? snapOf : snapOfOnly
  const snap = useMemo(
    () => (engine ? derive(engine, { loot, kills: killMobs, cons, itemMobs, itemForage }, WIKI, only) : engine),
    [derive, engine, loot, killMobs, itemMobs, itemForage, cons, only]
  )
  const kills = lastKills([killMobs], () => killIndex(killMobs))
  return { snap, engine, loot, ownLoot: liveLoot, kills, seenBy: joined?.seenBy, joining: all !== deferredAll }
}
