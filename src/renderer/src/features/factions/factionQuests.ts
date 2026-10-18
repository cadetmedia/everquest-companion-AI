// factions/factionQuests.ts — faction name → the quests that move it. PURE logic module
// (node-testable, no React/IPC), the gearOwnership.ts arrangement.
//
// THE SOURCE is the committed quest catalog (data/eqlegends/quests.json), whose entries carry the
// faction receipt lines their wiki pages quote (`QuestEntry.factions`, scraped offline from the
// cached corpus — scripts/sources/questPage.ts parseFactionHits). The JOIN KEY is the faction's
// name: the wiki links `[[Kerra Isle]]` and the `/outputfile faction` dump's Name column says
// `Kerra Isle`, so a name equality is the whole join — keyed through `factionNameKey`, the one join
// key, since the quest pages also drop the dump's spelling (`Freeport Militia`, `Da Bashers`).
// Factions the dump tracks but no quest page names simply have no work on record; factions quest
// pages name but the dump does not track (Kunark/Velious-era names in a classic dump) are indexed
// anyway and shown or not by the caller.
//
// OUT-OF-ERA QUESTS ARE NOT WORK. A page bannered for an expansion the server has not opened
// (`{{Kunark Era}}` Dragon Scales Quest quotes a Temple Of Sol Ro raise) is dropped before it is
// indexed, through the shared rule (questEra.ts `inEraQuests` → era.ts `eraBadgeOverrides`), so it
// is neither a raise, a cost, a nearby candidate, a home-zone vote nor a "some quest raises this"
// witness. Un-bannered pages stay in: silence is not an out-of-era claim.
//
// THE PROJECTION HAPPENS HERE, ONCE (owner ruling 4's shape): quests project into this file's own
// row model as they are indexed, so the view filters and sorts ITS OWN rows, never the catalog's.
//
// ZONE IS A STRING FOR NOW: the app has no zone deep link (appRouting reaches mobs, loot, quests,
// levels — not maps), so the start zone renders as text. The day Maps grows a focus payload, the
// zone here is the string to hand it.

import type { QuestData, QuestEntry } from '@shared/types'
import { factionNameKey } from '../../../../shared/outputs/factions'
import type { Era } from '../../../../shared/planner/era'
import { inEraQuests } from '../../../../shared/questEra'
import questsJson from '../../data/eqlegends/quests.json'

/** ONE QUEST as the factions tab draws it — this file's own shape, projected from the catalog. */
export interface FactionQuestRef {
  /** the quest's display name (also its wiki page title) */
  name: string
  /** the wiki page title, for the external link (`wikiPageUrl`) — the item dialog's Source idiom */
  page: string
  /** who takes the turn-in, when the page said */
  giver?: string
  /** where the quest starts, when the page said — text only (no zone deep link exists yet) */
  startZone?: string
  minLevel?: number
  /** the classes the page lists, verbatim wiki tokens — factionFilters.ts owns the reading */
  classes?: string[]
  /** the coin turn-in ("2 gold") — the guard-donation quests' whole cost (QuestEntry.coin) */
  coin?: string
  /** the items to hand in — the "save these" list, each linkable to its Loot drill-down */
  items: string[]
  /** the reward items, linkable the same way */
  rewards: string[]
  /** the signed per-turn-in delta for THIS faction, only when the page stated one */
  amount?: number
  /**
   * THE WHOLE RECEIPT: every faction the page says this turn-in moves, raises first, in the
   * page's own order inside each half (owner ask, 2026-10-12: "see the total faction hit"). A
   * Miners Guild 628 quest that also costs Butcherblock Bandits says so on its own line, and
   * factionCare.ts reads the losses against the factions the player has marked don't-care.
   * Empty for the silent home-zone quests, whose pages state nothing.
   */
  hits: ReceiptHit[]
}

/** One faction on a quest's receipt, with its join key folded once here. */
export interface ReceiptHit {
  name: string
  /** `factionNameKey(name)` — the key the dump rows and the don't-care set use */
  key: string
  up: boolean
  /** signed, only when the page stated a number */
  amount?: number
}

/** The quest's receipt, raises then losses, each half in page order. */
function receiptOf(q: QuestEntry): ReceiptHit[] {
  const hits = (q.factions ?? []).map(
    (h): ReceiptHit => ({
      name: h.name,
      key: factionNameKey(h.name),
      up: h.up,
      ...(h.amount === undefined ? {} : { amount: h.amount })
    })
  )
  return [...hits.filter((h) => h.up), ...hits.filter((h) => !h.up)]
}

/** Everything on record for one faction: the quests that raise it, the ones that cost it, and
 *  the home-zone quests whose pages state no faction effect at all (the `nearby` candidates). */
export interface FactionWork {
  raise: FactionQuestRef[]
  lower: FactionQuestRef[]
  /**
   * THE FACTION'S HOME ZONE, derived: the most frequent start zone among its RAISING quests.
   * Kerra Isle's two attributed raisers both start on Kerra Island, and that inference is what
   * lets the fourteen other Kerra Island quest pages — none of which quote a receipt line —
   * reach the panel at all.
   */
  homeZone?: string
  /**
   * Quests starting in `homeZone` whose pages state NO faction effect — candidates, not claims
   * (the panel labels them exactly that way). They exist because wiki authors quote receipts
   * inconsistently: the measured Kerra Island page set attributes 2 of 16 quests, and the
   * regen-necklace quest (This Means Warrr → Talisman of Kejaar Kerrath) is among the silent 14.
   * A turn-in to a home-zone NPC almost certainly moves the faction; "almost certainly" is not
   * a receipt, so these are shown labeled rather than merged into `raise`.
   */
  nearby: FactionQuestRef[]
}

function toRef(q: QuestEntry, amount: number | undefined): FactionQuestRef {
  const ref: FactionQuestRef = {
    name: q.name,
    page: q.page,
    items: q.requiredItems ?? [],
    rewards: [],
    hits: receiptOf(q),
    ...(q.giver === undefined ? {} : { giver: q.giver }),
    ...(q.startZone === undefined ? {} : { startZone: q.startZone }),
    ...(q.minLevel === undefined ? {} : { minLevel: q.minLevel }),
    ...(q.classes === undefined ? {} : { classes: q.classes }),
    ...(q.coin === undefined ? {} : { coin: q.coin }),
    ...(amount === undefined ? {} : { amount })
  }
  for (const r of q.rewards ?? []) ref.rewards.push(r.name)
  return ref
}

/** Biggest known payout first, unknown amounts after, names as the stable tail. */
function byPayout(a: FactionQuestRef, b: FactionQuestRef): number {
  const av = a.amount === undefined ? -1 : Math.abs(a.amount)
  const bv = b.amount === undefined ? -1 : Math.abs(b.amount)
  return bv - av || a.name.localeCompare(b.name)
}

/** The most frequent start zone among the raising quests, or nothing when none states one. */
function homeZoneOf(raise: readonly FactionQuestRef[]): string | undefined {
  const counts = new Map<string, number>()
  let best: string | undefined
  let bestN = 0
  for (const r of raise) {
    if (r.startZone === undefined) continue
    const n = (counts.get(r.startZone) ?? 0) + 1
    counts.set(r.startZone, n)
    if (n > bestN) {
      bestN = n
      best = r.startZone
    }
  }
  return best
}

/**
 * The whole index, built once per process from the committed catalog (904 quests is a
 * milliseconds-scale walk) — keyed by LOWERCASED faction name.
 */
/** File one silent quest (no stated faction effect) under its start zone. */
function fileSilent(q: QuestEntry, silentByZone: Map<string, FactionQuestRef[]>): void {
  if ((q.factions?.length ?? 0) > 0 || q.startZone === undefined) return
  let list = silentByZone.get(q.startZone)
  if (list === undefined) {
    list = []
    silentByZone.set(q.startZone, list)
  }
  list.push(toRef(q, undefined))
}

/** Sort a faction's lists and attach its home zone's silent quests. Split from the builder at
 *  the measured complexity ceiling. */
function finishWork(work: FactionWork, silentByZone: ReadonlyMap<string, FactionQuestRef[]>): void {
  work.raise.sort(byPayout)
  work.lower.sort(byPayout)
  const home = homeZoneOf(work.raise)
  if (home === undefined) return
  work.homeZone = home
  work.nearby = [...(silentByZone.get(home) ?? [])].sort((a, b) => a.name.localeCompare(b.name))
}

/** `era` defaults to what the server ships (questEra.ts); quests whose banner is out of it are
 *  never indexed. */
export function buildFactionWorkIndex(quests: readonly QuestEntry[], era?: Era): Map<string, FactionWork> {
  const index = new Map<string, FactionWork>()
  // The silent half: zone → the quests whose pages state no faction effect at all.
  const silentByZone = new Map<string, FactionQuestRef[]>()
  for (const q of inEraQuests(quests, era)) {
    fileSilent(q, silentByZone)
    for (const hit of q.factions ?? []) {
      const key = factionNameKey(hit.name)
      let work = index.get(key)
      if (work === undefined) {
        work = { raise: [], lower: [], nearby: [] }
        index.set(key, work)
      }
      ;(hit.up ? work.raise : work.lower).push(toRef(q, hit.amount))
    }
  }
  for (const work of index.values()) finishWork(work, silentByZone)
  return index
}

let cached: Map<string, FactionWork> | null = null

/** The committed catalog's index, memoized — the bundle cannot change while the app runs. */
export function factionWorkIndex(): Map<string, FactionWork> {
  cached ??= buildFactionWorkIndex((questsJson as QuestData).quests)
  return cached
}

/** The join keys of every faction at least one IN-ERA quest RAISES — `raisedFactionKeys` folds it.
 *  A Kunark quest that would win a faction back cannot today, so it is no witness. */
export function raisedKeysOf(quests: readonly QuestEntry[], era?: Era): Set<string> {
  const out = new Set<string>()
  for (const q of inEraQuests(quests, era)) for (const h of q.factions ?? []) if (h.up) out.add(factionNameKey(h.name))
  return out
}

let raisedCached: Set<string> | null = null

/**
 * Factions some quest on record raises. A loss on a faction NOT in here is one no quest can win
 * back (Butcherblock Bandits: lowered by seven quests, raised by none) — the receipt says so on
 * its hover, the strongest hint the catalog has that a faction is safe to let fall.
 */
export function raisedFactionKeys(): ReadonlySet<string> {
  raisedCached ??= raisedKeysOf((questsJson as QuestData).quests)
  return raisedCached
}
