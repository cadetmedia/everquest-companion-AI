// useGapsData — everything the Gaps tab reads, joined once: the engine's rows, the derived domains
// (factions, drops, images) checked against the catalog here, and what the page builders need beside
// them (the wiki's zone spellings, which names are catalog mobs, the data's date).

import { useDeferredValue, useMemo } from 'react'
import type { GapDomain, GapsSnap } from '@shared/gaps'
import { GAPS_MODULE_ID } from '@shared/gaps'
import type { ConsiderSnap, LootSnap } from '@shared/types'
import { killIndex, type KillMap, type KillsSnap } from '@shared/kills'
import { withFactionRows } from '@shared/gapFactions'
import { lootedItemNames, withDropRows, type DropAliases, type DropGroups } from '@shared/gapDrops'
import { withImageRows } from '@shared/gapImages'
import { catalogNameTest, commonLootNames, vendorFinder } from '@shared/gapMobPage'
import { catalogZoneCounts, wikiZoneNamer } from '@shared/gapWikiZone'
import type { PageExtras, ZoneNamer } from '@shared/wikiPage'
import dropGroupsJson from '../../data/eqlegends/dropGroups.json'
import mobsJson from '../../data/eqlegends/mobs.json'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { joinCharacters, otherInputs, type CharacterGaps } from '@shared/gapsAllCharacters'
import { useModule } from '../../lib/useModule'
import { useItemMobs } from '../../lib/gapItemMobs'
import { useThrottled } from '../../lib/useThrottled'

/** Each drop group's members, and the drop-list links that redirect to an item (scrape-drop-groups.ts). */
const DROPS = dropGroupsJson as { groups: DropGroups; aliases?: DropAliases }
/** The wiki data's date, `2026-10-19`: the chips' tooltips and the tab's caption say it. */
export const GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)

const ZONE_NAME: ZoneNamer = wikiZoneNamer(catalogZoneCounts(MOB_CATALOG))
const IS_MOB = catalogNameTest(MOB_CATALOG)
export const PAGE_EXTRAS: PageExtras = { zoneName: ZONE_NAME, isMob: IS_MOB, commonLoot: commonLootNames(MOB_CATALOG), vendorAt: vendorFinder(MOB_CATALOG) }

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

const NO_LOOT: LootSnap = []
const NO_NAMES: readonly string[] = []

/** How the list is built when nobody is looking at it (the Wiki Gaps overlay's publisher). */
export interface GapsDataOptions {
  /** Derive only this domain's rows (the overlay shows one domain); every domain when absent. */
  only?: GapDomain
  /** Take the game's new data at most this often, in ms; 0 (the tab) takes every push. */
  holdMs?: number
}

export function useGapsData(all: AllCharacters | null = null, opts: GapsDataOptions = {}): GapsData {
  const { only, holdMs = 0 } = opts
  // The four feeds, held together on one clock when `holdMs` is set (owner, 2026-10-20: the
  // overlay's background copy re-derived the whole list on every kill, loot and /con, and every
  // tab click in the app waited behind it).
  const fed = {
    engine: useModule<GapsSnap>(GAPS_MODULE_ID),
    loot: useModule<LootSnap>('loot'),
    kills: useModule<KillsSnap>('kills'),
    cons: useModule<ConsiderSnap>('consider')
  }
  const fresh = useMemo(() => fed, [fed.engine, fed.loot, fed.kills, fed.cons]) // eslint-disable-line react-hooks/exhaustive-deps
  const { engine: liveEngine, loot: liveLoot, kills: liveKills, cons } = useThrottled(fresh, holdMs)
  // The join runs a beat behind the box, so the tab stays live and can say it is working (owner, 2026-10-19).
  const deferredAll = useDeferredValue(all)
  // All characters (owner, 2026-10-19): the attached character's live inputs joined with every other
  // character's saved ones, each cut to the day window, before anything is derived from them.
  const joined = useMemo(() => {
    if (deferredAll === null || liveEngine == null) return null
    const live = { label: deferredAll.liveLabel, gaps: liveEngine, loot: liveLoot ?? [], kills: liveKills ?? null }
    return joinCharacters([live, ...otherInputs(deferredAll.others, IS_MOB)], deferredAll.cut)
  }, [deferredAll, liveEngine, liveLoot, liveKills])
  const engine = joined === null ? liveEngine : joined.gaps
  const loot = joined === null ? liveLoot : joined.loot
  const killMobs = joined === null ? liveKills?.mobs : joined.kills?.mobs
  // The item pages' side of each drop, asked of main (the corpus is main-only).
  // Only the domains asked for are derived: the overlay on Images never builds Factions or Drops.
  const wants = (d: GapDomain): boolean => only === undefined || only === d
  const wantDrops = wants('drop')
  const looted = useMemo(() => (wantDrops ? lootedItemNames(loot ?? []) : NO_NAMES), [loot, wantDrops])
  const itemMobs = useItemMobs(looted)
  const snap = useMemo(() => {
    if (!engine) return engine
    const wiki = { catalog: MOB_CATALOG, groups: DROPS.groups, itemMobs, aliases: DROPS.aliases ?? {} }
    let derived = wants('faction') ? withFactionRows(engine, MOB_CATALOG, killMobs ?? {}) : engine
    if (wantDrops) derived = withDropRows(derived, loot ?? [], wiki)
    return wants('image') ? withImageRows(derived, { kills: killMobs ?? {}, loot: loot ?? [], cons: cons ?? [] }, MOB_CATALOG) : derived
    // `wants` reads `only`, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, loot, killMobs, itemMobs, cons, only, wantDrops])
  const kills = useMemo(() => killIndex(killMobs ?? {}), [killMobs])
  return { snap, engine, loot: loot ?? [], ownLoot: liveLoot ?? NO_LOOT, kills, seenBy: joined?.seenBy, joining: all !== deferredAll }
}
