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
import questsJson from '../../data/eqlegends/quests.json'
import { questCatalogFinder, questTitleKey, withQuestPages, type QuestCatalogEntry, type QuestJournalFacts } from '@shared/gapQuests'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { questJournalNow, useQuestJournals } from './itemShotsStore'
import { joinCharacters, otherInputs, ownSince, type CharacterGaps, type JoinedGaps, type OwnGaps } from '@shared/gapsAllCharacters'
import { useModule } from '../../lib/useModule'
import { useItemMobs } from '../../lib/gapItemMobs'
import { useThrottled } from '../../lib/useThrottled'
import { mobPageFinder } from '@shared/mobPageTitle'
import { catalogStates } from '@shared/gapMerchantDescription'
import { useQuestLivePages } from '../../lib/questLivePages'
import { withForcedQuests, withQuestLinks, type ForcedQuestMap, type TalkSnap, type TalkVisit } from '@shared/gapForcedQuests'
import type { QuestThread } from '@shared/gapQuestThreads'
import { popupLinksOfRows } from '@shared/questPopup'
import { withZoneRedirects } from '@shared/gapZoneRedirects'
import { zoneKey } from '@shared/zones'
import { useForcedQuests, type ForcedQuests } from './useForcedQuests'
import { useEditedSnap } from './gapEditsStore'
import type { ForcedScope } from './ForcedQuests'

/** Each drop group's members, and the drop-list links that redirect to an item (scrape-drop-groups.ts). */
const DROPS = dropGroupsJson as { groups: DropGroups; aliases?: DropAliases }
/** The wiki data's date, `2026-10-19`: the chips' tooltips and the tab's caption say it. */
export const GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)

const ZONE_COUNTS = catalogZoneCounts(MOB_CATALOG)
const ZONE_NAME: ZoneNamer = wikiZoneNamer(ZONE_COUNTS)
/** The zone spellings the mob catalog links: a page by that name exists, so no redirect is offered (gapZoneRedirects.ts). */
const CATALOG_ZONES: ReadonlySet<string> = new Set([...ZONE_COUNTS.keys()].map(zoneKey))
const IS_MOB = catalogNameTest(MOB_CATALOG)
/** A quest's catalog entry when the wiki has its page (the Quests rows' Make page / Update page). */
const QUEST_ENTRY = questCatalogFinder((questsJson as { quests: QuestCatalogEntry[] }).quests)
/** The catalog's quest titles: names "Add quest" offers, so a page the wiki has can be picked. */
export const QUEST_TITLES: readonly string[] = (questsJson as { quests: QuestCatalogEntry[] }).quests.map((q) => q.page)
/** The catalog's entry, else a page a Copy click found on the wiki this session (questLivePages.ts). */
const questPageOf = (live: ReadonlyMap<string, string>) => (name: string): QuestCatalogEntry | undefined => {
  const found = QUEST_ENTRY(name) === undefined ? live.get(questTitleKey(name)) : undefined
  return found === undefined ? QUEST_ENTRY(name) : { name: found, page: found }
}
export const PAGE_EXTRAS: PageExtras = { zoneName: ZONE_NAME, isMob: IS_MOB, commonLoot: commonLootNames(MOB_CATALOG), vendorAt: vendorFinder(MOB_CATALOG), mobPage: mobPageFinder(MOB_CATALOG), questEntry: QUEST_ENTRY, questJournal: questJournalNow, pageStates: catalogStates(MOB_CATALOG) }

/** The wiki side, one object for the session: the caches key on it. */
const WIKI: GapsWiki = { catalog: MOB_CATALOG, groups: DROPS.groups, aliases: DROPS.aliases ?? {} }
/** The fallbacks before a module has state: one object each, so a cache key stays the same. */
const NO_LOOT: LootSnap = []
const NO_KILLS: KillMap = {}
const NO_CONS: ConsiderSnap = []
const snapOf = lastGapsSnap()
const snapOfOnly = lastGapsSnap()
const lastLooted = memoLast<readonly string[]>()
const lastKills = memoLast<KillMap>()
const lastOwnCut = memoLast<OwnGaps>()
const lastOwnCutOnly = memoLast<OwnGaps>()

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
  /** The quests the player named by hand (the attached character's), the visits to pick from and the names offered. */
  forced: ForcedScope
}

const NO_TALKS: readonly TalkVisit[] = []
/** A snapshot's talks and character (gaps.rs `snapshot`), which `GapsSnap` does not type. */
const talkSnapOf = (snap: object | null | undefined): TalkSnap | null => snap ?? null
const NO_THREADS: readonly QuestThread[] = []

/** After the derivation (`joinedSnap`): the tab's slot and the overlay's. */
const lastJoined = memoLast<GapsSnap>()
const lastJoinedOnly = memoLast<GapsSnap>()

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
  /** The day window (owner, 2026-10-21: every view, not only All characters); none when absent. */
  cut?: { stamp: string; ms: number } | null
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

/**
 * What the derivation reads for the attached character alone, cut to the day window when one is
 * given. Kept across the tab's remounts while the inputs are the same objects: a cut builds new
 * arrays, and a new array would miss every derivation cache keyed on it. The overlay's one-domain
 * copy passes its own `memo`, so it and the tab never evict each other.
 */
function ownInputs(
  feeds: { engine: GapsSnap | null; loot: LootSnap; kills: KillsSnap | null },
  cut: { stamp: string; ms: number } | null,
  memo: ReturnType<typeof memoLast<OwnGaps>>
): { engine: GapsSnap | null; loot: LootSnap; killMobs: KillMap } {
  const { engine, loot, kills } = feeds
  if (engine == null || cut === null) return { engine, loot, killMobs: kills?.mobs ?? NO_KILLS }
  const own = memo([engine, loot, kills, cut.stamp], () => ownSince({ gaps: engine, loot, kills }, cut))
  return { engine: own.gaps, loot: own.loot, killMobs: own.kills?.mobs ?? NO_KILLS }
}

/** What the derivation reads with All characters joined. */
function joinedInputs(joined: JoinedGaps): { engine: GapsSnap | null; loot: LootSnap; killMobs: KillMap } {
  return { engine: joined.gaps, loot: joined.loot, killMobs: joined.kills?.mobs ?? NO_KILLS }
}

/** What the join after the derivation reads beside the rows (`joinedSnap`). */
interface JoinInputs {
  live: TalkSnap | null
  forced: ForcedQuestMap
  livePages: ReadonlyMap<string, string>
  /** The pasted Quest Journal and popup readings, by quest key (itemShotsStore.ts). */
  journals: Readonly<Record<string, QuestJournalFacts>>
  only: GapDomain | undefined
}

/**
 * After the derivation: the named quests (and the visits left to pick from), each quest's popup rewards
 * on their item rows (questPopup.ts `popupLinksOfRows`), quest pages and Zones (a zone's redirect to
 * copy), in their own slot so a remount hits; the overlay's one-domain copy apart.
 */
function joinedSnap(derived: GapsSnap, x: JoinInputs): GapsSnap {
  return (x.only === undefined ? lastJoined : lastJoinedOnly)([derived, x.live?.talks, x.live?.questThreads, x.forced, x.livePages, x.journals], () => {
    // The live snapshot's talks and chains: a joined or day-cut snapshot is rebuilt without them.
    const named = withForcedQuests({ ...derived, talks: x.live?.talks ?? [], questThreads: x.live?.questThreads ?? [] }, x.forced)
    const linked = { ...named, rows: withQuestLinks(named.rows, popupLinksOfRows(named.rows, (q) => x.journals[questTitleKey(q)]?.popups)) }
    return withZoneRedirects(withQuestPages(linked, questPageOf(x.livePages)), CATALOG_ZONES)
  })
}

/** "Add quest" and "Add talk"'s scope: the named quests, the visits left to pick from, the names offered. */
function useForcedScope(forced: ForcedQuests, snap: TalkSnap | null | undefined): ForcedScope {
  const talks = snap?.talks ?? NO_TALKS
  // The chains the log rebuilt (gaps_threads.rs), for Suggested quests.
  const threads = snap?.questThreads ?? NO_THREADS
  return useMemo(() => ({ ...forced, talks, threads, titles: QUEST_TITLES }), [forced, talks, threads])
}

export function useGapsData(all: AllCharacters | null = null, opts: GapsDataOptions = {}): GapsData {
  const { only, holdMs = 0, cut = null } = opts
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
  const feeds = { engine: liveEngine, loot: liveLoot, kills: liveKills }
  const { engine, loot, killMobs } = joined === null ? ownInputs(feeds, cut, only === undefined ? lastOwnCut : lastOwnCutOnly) : joinedInputs(joined)
  // The item pages' side of each drop, asked of main (the corpus is main-only), and only when Drops
  // is derived. The same array while the loot is the same, so useItemMobs' effect does not rerun.
  const wantDrops = only === undefined || only === 'drop'
  const looted = lastLooted([loot, wantDrops], () => (wantDrops ? lootedItemNames(loot) : NO_NAMES))
  const itemMobs = useItemMobs(looted)
  // The overlay's one-domain copy keeps its own cache slot, so it and the tab never evict each other.
  const derive = only === undefined ? snapOf : snapOfOnly
  // A page the wiki answered with on a Copy click turns its row into Update page (owner, 2026-10-23).
  const livePages = useQuestLivePages()
  // The quests the player named (owner, 2026-10-23: "force a quest association"): the attached
  // character's, from its own snapshot, also under All characters (another character's are not loaded).
  const live = talkSnapOf(liveEngine)
  const forced = useForcedQuests(live?.character)
  // A popup's reward joins its item's page as soon as the popup is pasted (useQuestJournals is live).
  const journals = useQuestJournals()
  const snap = useMemo(
    () => (engine ? joinedSnap(derive(engine, { loot, kills: killMobs, cons, itemMobs }, WIKI, only), { live, forced: forced.forced, livePages, journals, only }) : engine),
    [derive, engine, loot, killMobs, itemMobs, cons, only, livePages, live, forced.forced, journals]
  )
  const kills = lastKills([killMobs], () => killIndex(killMobs))
  // The rows the player corrected by hand (owner, 2026-10-23: "EDIT values in the gaps tab").
  const edited = useEditedSnap(snap, live)
  return { snap: edited, engine, loot, ownLoot: liveLoot, kills, seenBy: joined?.seenBy, joining: all !== deferredAll, forced: useForcedScope(forced, talkSnapOf(snap)) }
}
