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

import { useMemo } from 'react'
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
import questsJson from '../../data/eqlegends/quests.json'
import { questCatalogFinder, questTitleKey, withQuestPages, type QuestCatalogEntry } from '@shared/gapQuests'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { useModule } from '../../lib/useModule'
import { useItemMobs } from '../../lib/gapItemMobs'
import { mobPageFinder } from '@shared/mobPageTitle'
import { catalogStates } from '@shared/gapMerchantDescription'
import { useQuestLivePages } from '../../lib/questLivePages'

/** Each drop group's members, and the drop-list links that redirect to an item (scrape-drop-groups.ts). */
const DROPS = dropGroupsJson as { groups: DropGroups; aliases?: DropAliases }
/** The wiki data's date, `2026-10-19`: the chips' tooltips and the tab's caption say it. */
export const GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)

const ZONE_NAME: ZoneNamer = wikiZoneNamer(catalogZoneCounts(MOB_CATALOG))
const IS_MOB = catalogNameTest(MOB_CATALOG)
/** A quest's catalog entry when the wiki has its page (the Quests rows' Make page / Update page). */
const QUEST_ENTRY = questCatalogFinder((questsJson as { quests: QuestCatalogEntry[] }).quests)
/** The catalog's entry, else a page a Copy click found on the wiki this session (questLivePages.ts). */
const questPageOf = (live: ReadonlyMap<string, string>) => (name: string): QuestCatalogEntry | undefined => {
  const found = QUEST_ENTRY(name) === undefined ? live.get(questTitleKey(name)) : undefined
  return found === undefined ? QUEST_ENTRY(name) : { name: found, page: found }
}
export const PAGE_EXTRAS: PageExtras = { zoneName: ZONE_NAME, isMob: IS_MOB, commonLoot: commonLootNames(MOB_CATALOG), vendorAt: vendorFinder(MOB_CATALOG), mobPage: mobPageFinder(MOB_CATALOG), questEntry: QUEST_ENTRY, pageStates: catalogStates(MOB_CATALOG) }

/** The wiki side, one object for the session: the caches key on it. */
const WIKI: GapsWiki = { catalog: MOB_CATALOG, groups: DROPS.groups, aliases: DROPS.aliases ?? {} }
/** The fallbacks before a module has state: one object each, so a cache key stays the same. */
const NO_LOOT: LootSnap = []
const NO_KILLS: KillMap = {}
const NO_CONS: ConsiderSnap = []
const snapOf = lastGapsSnap()
const lastLooted = memoLast<string[]>()
const lastKills = memoLast<KillMap>()

export interface GapsData {
  /** The engine's snapshot with the derived domains joined in; undefined until it lands. */
  snap: GapsSnap | null | undefined
  /** The engine's own snapshot: its kill factions and mob points feed the pages. */
  engine: GapsSnap | null | undefined
  loot: LootSnap
  kills: KillMap
}

export function useGapsData(): GapsData {
  const engine = useModule<GapsSnap>(GAPS_MODULE_ID)
  const loot = useModule<LootSnap>('loot') ?? NO_LOOT
  const killMobs = useModule<KillsSnap>('kills')?.mobs ?? NO_KILLS
  const cons = useModule<ConsiderSnap>('consider') ?? NO_CONS
  // The item pages' side of each drop, asked of main (the corpus is main-only). The same array while
  // the loot is the same, so useItemMobs' effect does not rerun on a remount.
  const looted = lastLooted([loot], () => lootedItemNames(loot))
  const itemMobs = useItemMobs(looted)
  // A page the wiki answered with on a Copy click turns its row into Update page (owner, 2026-10-23).
  const livePages = useQuestLivePages()
  const snap = useMemo(() => (engine ? withQuestPages(snapOf(engine, { loot, kills: killMobs, cons, itemMobs }, WIKI), questPageOf(livePages)) : engine), [engine, loot, killMobs, itemMobs, cons, livePages])
  const kills = lastKills([killMobs], () => killIndex(killMobs))
  return { snap, engine, loot, kills }
}
