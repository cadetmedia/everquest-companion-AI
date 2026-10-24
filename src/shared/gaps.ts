// shared/gaps.ts — the Gaps tab's data: names the log mentions that the app's wiki data has no
// record of (owner ask, 2026-10-11).
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) serves one row per unknown
// name, most mentioned first, at most 500 per domain, each with its details (gaps_details.rs):
// where the log named it, from whom, and the last lines the game printed. The tab's domain toggle
// and search box narrow those rows here rather than in the renderer, which never filters served
// rows (owner ruling 4); the Copy list text is rendered here for the same reason.

import type { FactionFix, KillFaction } from './gapFactions'
import type { GapEdit } from './gapEdits'
import { replaceWhy } from './gapDrops'
import { pageCheckAction } from './gapRedirects'
import { offerCheckText, offerText } from './gapOffers'
import { decodeFactionAmount } from './mobFactionAmounts'
import { wikiPageUrl } from './wiki'
import { zoneKey } from './zones'
import { wikiCreateUrl, wikiEditUrl, wikiSearchUrl, wikiUploadUrl } from './gapUrls'

export { wikiCreateUrl, wikiEditUrl, wikiSearchUrl, wikiUploadUrl }

export const GAPS_MODULE_ID = 'gaps'

/** `merchant`: an NPC the log saw trading that the wiki lists as no merchant; `faction`: a faction a
 *  kill moved that the mob's page does not name (shared/gapFactions.ts); `drop`: an item looted from a
 *  mob whose page lists neither it nor its group (shared/gapDrops.ts); `image`: a mob met whose page
 *  has no image (shared/gapImages.ts) (owner asks, 2026-10-18); `notice`: a mob or item the log met
 *  whose page says it may not be in Legends, `{{DNE}}` or `{{delete}}` (gaps_notices.rs; owner, 2026-10-22);
 *  `quest`: a task the log named, its page made or filled (gaps_quest_log.rs, shared/gapQuests.ts). */
export type GapDomain = 'item' | 'mob' | 'spell' | 'merchant' | 'faction' | 'drop' | 'image' | 'notice' | 'quest' | 'zone'
export const GAP_DOMAINS: readonly GapDomain[] = ['item', 'mob', 'spell', 'merchant', 'faction', 'drop', 'image', 'notice', 'quest', 'zone']
export const GAP_DOMAIN_LABELS: Record<GapDomain, string> = { item: 'Items', mob: 'Mobs', spell: 'Spells', merchant: 'Merchants', faction: 'Factions', drop: 'Drops', image: 'Images', notice: 'Notices', quest: 'Quests', zone: 'Zones' }

/** What the shown-count line calls a domain's rows: "Showing 11 of 395 mobs missing a wiki picture" (owner, 2026-10-19: "unknown images" read oddly). */
export const GAP_SHOWN_NOUN: Record<GapDomain, string> = {
  item: 'items with no wiki page',
  mob: 'mobs with no wiki page',
  spell: 'spells with no wiki page',
  merchant: 'merchants the wiki does not list',
  faction: 'factions to add or fix on mob pages',
  drop: 'drops missing from mob pages',
  image: 'mobs missing a wiki picture',
  notice: 'pages that say they are not in Legends',
  quest: 'quests your log took part in',
  zone: 'zone names that need a redirect'
}

/** One line under the toggle saying what the chosen domain's rows are (owner ask, 2026-10-18). */
export const GAP_DOMAIN_HELP: Record<GapDomain, string> = {
  item: 'Items your log, inventory export or a capture names that have no wiki page yet: make the page.',
  mob: 'Mobs you looted, killed, conned or hailed that have no wiki page yet: make the page.',
  spell: 'Spells cast near you that have no wiki page yet: make the page.',
  merchant: "NPCs you saw trading that the wiki doesn't mark as merchants: give them a merchant page.",
  faction: "Factions a kill changed that the mob's page is missing or states wrongly: fix the mob page.",
  drop: "Items you looted that the mob's page doesn't list (Motes excluded): add them to its loot.",
  image: 'Mobs you met whose wiki page has no picture: screenshot one and upload it.',
  notice: 'Mobs and items you met whose page says "not in Legends" or "up for deletion": remove the notice, since your log proves they exist.',
  quest: 'Quests your log took part in: make the page, or fill what its page is missing.',
  zone: 'Zone names your log printed that the wiki titles otherwise: make a redirect page.'
}

/**
 * What to collect in game for each domain's page (review 2026-10-19): the Copy wiki page tooltip
 * says it, since a page the log could not fill needs a second trip otherwise.
 */
export const GAP_CAPTURE: Record<GapDomain, string> = {
  item: 'Paste an item window screenshot for its stats.',
  mob: '/con, /loc then hail within 10 s, kill.',
  merchant: '/con, /loc then hail within 10 s.',
  spell: 'Paste the spell window for mana and timings.',
  faction: 'Paste into factions; kill again if no amount.',
  drop: "Paste it into the mob page's known_loot list.",
  image: 'Screenshot it; upload under the file name shown.',
  notice: 'Nothing: remove the notice and cite the lines below.',
  quest: 'Paste the Quest Journal for its level; hail and say each [keyword].',
  zone: 'Nothing: copy the redirect and save it as a new page.'
}

/** A row's key in the Done marks (owner ask, 2026-10-19). */
export const doneKey = (row: GapRow): string => `${row.domain}:${row.name}`

/**
 * The Done marks to keep (`key -> the day it was marked`): every mark made before the wiki data's
 * date is cleared (owner, 2026-10-19: "after a scrape, wipe all DONE entries"), so a row the refresh
 * still lacks comes back. A row's absence is never the test: the list fills in stages at launch and
 * swaps with the character, and dropping on absence lost marks.
 */
export function keptDoneMarks(marks: Readonly<Record<string, string>>, dataDate: string): Record<string, string> {
  return Object.fromEntries(Object.entries(marks).filter(([, markedOn]) => markedOn >= dataDate))
}

/**
 * The Done marks with every one of `rows` marked on `today`, or every one cleared: a mob heading's
 * one Done for every line under it (owner ask, 2026-10-21). A mark already made keeps its day.
 */
export function withDoneMarks(marks: Readonly<Record<string, string>>, rows: readonly GapRow[], on: boolean, today: string): Record<string, string> {
  const keys = new Set(rows.map(doneKey))
  if (!on) return Object.fromEntries(Object.entries(marks).filter(([k]) => !keys.has(k)))
  return { ...Object.fromEntries([...keys].map((k) => [k, today])), ...marks }
}

/** Every one of `rows` is marked done, and there is at least one. */
export function allDone(rows: readonly GapRow[], done: ReadonlySet<string>): boolean {
  return rows.length > 0 && rows.every((r) => done.has(doneKey(r)))
}

/** The rows less the marked players' Mobs rows and every row named for an own character (gapPlayers.ts). */
export { withoutPlayers } from './gapPlayers'

/**
 * Whether the tab is unsure the row is a gap at all ("Hide uncertain", owner, 2026-10-19). Only a
 * row whose EXISTENCE is in doubt: today a one-word name only hailed or conned that may be a player
 * (`maybePlayer`). Not a near miss (`suggest`: the wiki lacks this exact spelling, so a redirect is
 * still owed), not a faction whose direction no line stated, not a drop whose mob page the catalog
 * could not pick, not a verdict of the runtime caches: those are real gaps with an unsure detail.
 */
export function uncertainGap(row: GapRow): boolean {
  // A faction row for a mob the data has no page for: its page may be newer and list it (owner,
  // 2026-10-20: Peltin Funter's factions were already on the wiki).
  // A name known only through a wiki redirect: the redirect may be wrong (owner, 2026-10-22).
  return row.maybePlayer === true || row.noPage === true || row.viaRedirect !== undefined
}

/** The rows the tab is sure of. */
export function withoutUncertain(rows: readonly GapRow[]): GapRow[] {
  return rows.filter((r) => !uncertainGap(r))
}

/** The rows not marked done. */
export function withoutDone(rows: readonly GapRow[], done: ReadonlySet<string>): GapRow[] {
  return done.size === 0 ? [...rows] : rows.filter((r) => !done.has(doneKey(r)))
}

/** One spell as the client files state it; absent fields were not stated (or are zero). */
/** What the install's spells_us.txt / spells_us_str.txt state about a spell (src/main/gapSpellFacts.ts). */
export interface ClientSpellFacts {
  /** `[[Shaman]] - Level 43` order: the classes that can scribe it, with their level. */
  classes: { cls: string; level: number }[]
  mana?: number
  range?: number
  /** Seconds, as the wiki writes them (`1.50`). */
  castTime?: string
  recastTime?: string
  /** `Magic (-10)`. */
  resist?: string
  msgOnYou?: string
  msgOnOther?: string
  msgWearsOff?: string
}

/** Item name → the mobs its own item page names under `|dropsfrom`; null when the wiki has no page. */
export type ItemPageMobs = Record<string, string[] | null>

/** How the log named it. */
export type GapKind =
  | 'looted'
  | 'dropped-by'
  | 'received'
  | 'bought'
  | 'crafted'
  /** a mote fusion's result (`merged two items together`): not a tradeskill, so no Player Crafted */
  | 'fused'
  | 'foraged'
  | 'killed'
  | 'considered'
  | 'hailed'
  /**
   * a mob handed an item (`You offered 1 Fruit to a fallen froglok.`); an item handed to an NPC, taken
   * or handed back: proof the item exists (owner, 2026-10-22: Plea to Freeport, turned in to Sir Mollin)
   */
  | 'offered'
  /** heard speaking (`A fallen froglok says, '...'`); mob-shaped names only */
  | 'spoke'
  | 'cast'
  | 'quoted'
  | 'sold'
  /** a merchant offered to buy it (an item), or offered to buy an item (a merchant): gaps_offers.rs */
  | 'appraised'
  /**
   * `held`: in the player's inventory export with no log line naming it (a store purchase);
   * `captured`: an item window a capture read, with no log line naming it. Neither has a place:
   * a row of only these passes "Zone I'm in" (owner, 2026-10-22; shared/gapExtraItems.ts).
   */
  | 'held' | 'captured'
  /** `fished`: caught fishing (gaps_fished.rs); `assigned` / `updated`: a Quests row's task lines; `entered`: a Zones row's zone. */
  | 'fished' | 'assigned' | 'updated' | 'entered'

/**
 * One distinct merchant offer for an item, from the sell slot (`X told you, 'I'll give you ...'`;
 * owner ask, 2026-10-20). See shared/gapOffers.ts for what it is compared with.
 */
export interface GapOffer {
  merchant: string
  /** As printed, `5 silver 7 copper`; `nothing` for "absolutely nothing". */
  coin: string
  copper: number
  /** `per X`: the price of one of a stack. `for the X.` is one unstackable item: one item's price either way. */
  per?: true
  /** The player's last /con rung with that merchant before the offer (`ally`); absent with no con. */
  standing?: string
  /** Where the offer was made (the merchant's zone, never the item's). */
  zone?: string
  n: number
  /** The log's own stamp of the newest. */
  last: string
}

/** Distinct values with counts: the eight most frequent, and how many there were in all. */
export interface GapTally {
  entries: { name: string; n: number }[]
  distinct: number
  /** The zones list only: every zone by name, beyond the eight, for the "this zone" filter. */
  all?: string[]
}

/** The lists are absent when nothing was tallied; `samples` is always there. */
export interface GapDetails {
  /** The zone the fold was in when the line was read. */
  zones?: GapTally
  /** An item: the corpse it was looted from, or the merchant it was bought from. */
  sources?: GapTally
  /** An item: how the loot line disposed of it (depot, sold, hoard, combined, currency). */
  dispositions?: GapTally
  /** A mob: the items it was seen to drop. */
  drops?: GapTally
  /** A mob: what the /con said, `L50 indifferent`. */
  cons?: GapTally
  /** A mob: what killed it; `you`, or `nobody` for a "died." line. */
  killers?: GapTally
  /** A spell: who cast it; `you` for the player's own. */
  casters?: GapTally
  /**
   * An item: what an instant sale on loot paid, as the line printed it (`4 platinum 2 gold`).
   * NOT the real price: a sale on loot, to no vendor, is at a discount, so each amount is a floor.
   */
  sales?: GapTally
  /** An item: what a purchase line paid, the whole stack's price. */
  paid?: GapTally
  /** The two lists summed, in copper; absent when zero. */
  salesCopper?: number
  paidCopper?: number
  /** An item: what merchants offered for it, newest last, at most eight distinct. */
  offers?: GapOffer[]
  /** The last three raw log lines, oldest first. */
  samples: string[]
}

/** One known name within a character or two of the row's — see engine gaps_suggest.rs. */
export interface GapSuggest {
  name: string
  /** The wiki page title to link. */
  page: string
  distance: number
}

/** One unknown name, as the engine serves it. */
export interface GapRow {
  domain: GapDomain
  /** As the log spelled it; a spell with its rank stripped. */
  name: string
  /** In the order first seen. */
  kinds: GapKind[]
  count: number
  /** The log's own stamp, `2026-09-23 17:54:48`. */
  first: string
  last: string
  details: GapDetails
  /** Absent when no known name is close enough to name with confidence. */
  suggest?: GapSuggest
  /** A drop row of one item: whether that item's own page names the mob (shared/gapDrops.ts). */
  itemPage?: 'namesMob' | 'lacksMob'
  /** An image row: the file its in-game name gives (shared/gapImages.ts). */
  image?: string
  /** An image row whose page's own `imagefilename` names another file: that file (the page may need fixing). */
  pageImage?: string
  /** A faction, drop or image row: the wiki page of its mob, when the catalog could pick one; a notice row's page. */
  page?: string
  /** A notice row: the page's notices, `DNE`, `delete` or `delete: <reason>` (gaps_notices.rs). */
  notices?: string[]
  /** A notice row: whether the log met an item or a mob there. */
  subject?: 'item' | 'mob'
  /** A faction row: the amount most kills stated, and whether the kill raised the faction. */
  adjust?: number
  raised?: boolean
  /** A drop row whose item or group the wiki files under a mob page's `|common_loot`, not `|known_loot`. */
  lootField?: 'common_loot'
  /**
   * A group's drop row whose mob page lists other members one by one (owner, 2026-10-21): those
   * lines, which may become the group's while the page is edited, and their `[Overall: x%]` summed
   * when every one states it.
   */
  replaces?: { lines: string[]; rate?: number }
  /** A one-word name only hailed or conned that the log has not shown to be an NPC (gaps_players.rs). */
  maybePlayer?: boolean
  /** A faction row whose mob the wiki data has no page for: unchecked, since a newer page may list it. */
  noPage?: true
  /** A name the data knows only through a wiki redirect: the page it sends the name to (gapRedirects.ts). */
  viaRedirect?: string
  /** A faction row for a faction the page LISTS: what to fix, and what the page says (`-30..-10?`). */
  fix?: FactionFix
  pageSays?: string
  /** The player's own corrections to this row, by hand (shared/gapEdits.ts). */
  edit?: GapEdit
}

export interface GapsSnap {
  rows: GapRow[]
  /** Unknown names per domain — the served rows are the first 500 of these. */
  totals: Record<GapDomain, number>
  /** Distinct names checked per domain, known or not. */
  seen: Record<GapDomain, number>
  /** Each kill and the factions its lines moved (gaps_trade.rs), for shared/gapFactions.ts. */
  killFactions?: KillFaction[]
  /** Where a con or hail beside a `/loc` placed each mob, `/loc` order (gaps_locs.rs). */
  mobLocs?: { mob: string; zone: string; points: number[][] }[]
  /** What each mob was seen to do on its own attack lines, `Rampages` / `Flurries` (gaps_specials.rs). */
  mobSpecials?: { mob: string; specials: string[] }[]
  /** What each mob's corpse paid at the player's kills: how many paid, each coin's least and most (gaps_coin.rs). */
  mobCoin?: MobCoin[]
  /** The player's own pets by name (gaps.rs `own_pets`): a kill by one is the player's. */
  ownPets?: string[]
}

/** One mob's corpse coin, `[platinum, gold, silver, copper]` (gaps_coin.rs). */
export interface MobCoin {
  mob: string
  n: number
  min: number[]
  max: number[]
}

/** The lists in display order, with the words the tab and the copy text use for them. */
export type GapListKey = 'zones' | 'sources' | 'dispositions' | 'drops' | 'cons' | 'killers' | 'casters' | 'sales' | 'paid'
export const GAP_LISTS: { key: GapListKey; label: string }[] = [
  { key: 'zones', label: 'zones' },
  { key: 'sources', label: 'from' },
  { key: 'dispositions', label: 'disposed' },
  { key: 'drops', label: 'dropped' },
  { key: 'cons', label: 'con' },
  { key: 'killers', label: 'killed by' },
  { key: 'casters', label: 'cast by' },
  // The caveat travels in the word: a sale on loot is discounted, so these amounts are floors.
  { key: 'sales', label: 'sold on loot (discounted)' },
  { key: 'paid', label: 'paid' }
]

/**
 * Was the row named in this place, any tier (owner ask, 2026-10-17: work through a zone)? The
 * place is `zones.zoneKey`, so standing in `Befallen 4 (Refined)` admits a row seen in plain
 * `Befallen`. A row with no zones is in none.
 */
export function gapInZone(row: GapRow, zone: string): boolean {
  // An item held or captured with no line naming it was seen nowhere: it is in every zone's list.
  if (row.details.zones === undefined && row.kinds.length > 0 && row.kinds.every((k) => k === 'held' || k === 'captured')) return true
  const here = zoneKey(zone)
  const zones = row.details.zones
  const names = zones?.all ?? zones?.entries.map((e) => e.name) ?? []
  return here !== '' && names.some((z) => zoneKey(z) === here)
}

/**
 * The rows of one domain whose name or kinds contain the query, case-folded, and, given a zone,
 * only those named there; engine order kept.
 */
export function visibleGaps(rows: readonly GapRow[], domain: GapDomain, query: string, zone: string | null = null): GapRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter(
    (r) =>
      r.domain === domain &&
      (q === '' || r.name.toLowerCase().includes(q) || r.kinds.some((k) => k.includes(q))) &&
      (zone === null || gapInZone(r, zone))
  )
}

/** `a treant (11), a kobold (2) +3 more` — one tally as a phrase. */
export function tallyText(t: GapTally): string {
  const shown = t.entries.map((e) => `${e.name} (${e.n})`).join(', ')
  const more = t.distinct - t.entries.length
  return more > 0 ? `${shown} +${more} more` : shown
}

/** `4 platinum 2 gold 1 silver 4 copper` → copper; the engine's one spelling, so no commas or "and". */
export function parseCoin(coin: string): number {
  const per: Record<string, number> = { platinum: 1000, gold: 100, silver: 10, copper: 1 }
  let copper = 0
  for (const m of coin.matchAll(/(\d+) (platinum|gold|silver|copper)/g)) copper += Number(m[1]) * per[m[2]]
  return copper
}

/** Copper → `1 platinum 1 gold 4 silver 3 copper`, zero parts left out; `0 copper` for nothing. */
export function formatCoin(copper: number): string {
  const parts: string[] = []
  let rest = Math.max(0, Math.round(copper))
  for (const [word, per] of [['platinum', 1000], ['gold', 100], ['silver', 10], ['copper', 1]] as const) {
    const n = Math.floor(rest / per)
    rest -= n * per
    if (n > 0) parts.push(`${n} ${word}`)
  }
  return parts.length > 0 ? parts.join(' ') : '0 copper'
}

/** What one instant sale on loot implies, in copper — see `derivedPrices`. */
export interface DerivedPrices {
  /** The instant sale, as the line printed it. */
  sale: number
  /** The item's base price: the sale is base ÷ 1.4. */
  base: number
  /** The loot window's Value line, what a vendor pays at best standing: base ÷ 1.05. */
  vendorValue: number
}

/**
 * The real prices behind an instant sale. Measured on the owner's whole log (9,129 sale lines,
 * docs/community/agent/MEASURED.md): an instant sale on loot pays the item's base price ÷ 1.4,
 * rounded to the nearest copper, the same at every tier, and the game's Value line is base ÷ 1.05.
 * Both are derived from the rounded base rather than as one factor on the sale, which is what
 * matches the screenshots to the copper (Gold Ring 857c → Value 1,143c, base 1,200c; Jade Earring
 * 3,214c → 4,286c, 4,500c). The sale read is the row's most frequent sale amount; `null` when the
 * row has no sale, or only free ones.
 */
export function derivedPrices(details: GapDetails): DerivedPrices | null {
  const sale = parseCoin(details.sales?.entries[0]?.name ?? '')
  if (sale <= 0) return null
  const base = Math.round(sale * 1.4)
  return { sale, base, vendorValue: Math.round(base / 1.05) }
}

/** The header the copy text starts with. */
export const GAPS_TEXT_HEADER = 'Name\tSeen as\tTimes\tFirst\tLast'

/**
 * One row as lines: its tab-separated fields, then each list it has and its sample lines, each
 * indented by a tab so a paste into an issue keeps the row and its details together.
 */
/** `1 character off`, `2 characters off`. */
export function charactersOff(distance: number): string {
  return `${distance} character${distance === 1 ? '' : 's'} off`
}

export function gapDetailsText(row: GapRow, verdict: GapVerdict = 'unchecked'): string {
  const lines = [[row.name, row.kinds.join(', '), String(row.count), row.first, row.last].join('\t')]
  if (row.suggest !== undefined) lines.push(`\tprobably: ${row.suggest.name} (${charactersOff(row.suggest.distance)})`)
  lines.push(`\taction: ${gapActions(row, verdict).map((a) => a.label).join(' · ')}`)
  for (const { key, label } of GAP_LISTS) {
    const t = row.details[key]
    if (t === undefined) continue
    lines.push(`\t${label}: ${tallyText(t)}`)
    const prices = key === 'sales' ? derivedPrices(row.details) : null
    if (prices !== null) lines.push(`\tvendor value: ${formatCoin(prices.vendorValue)}`)
  }
  const estimate = derivedPrices(row.details)?.vendorValue
  for (const o of row.details.offers ?? []) lines.push(`\tmerchant offer: ${offerText(o)} (${offerCheckText(o, estimate)})`)
  for (const s of row.details.samples) lines.push(`\tsample: ${s}`)
  return lines.join('\n')
}

/** The visible rows as text with a header, each row followed by its details, for pasting into an issue. */
export function gapsAsText(rows: readonly GapRow[], verdicts: GapVerdicts = {}): string {
  return [GAPS_TEXT_HEADER, ...rows.map((r) => gapDetailsText(r, verdicts[r.name] ?? 'unchecked'))].join('\n')
}

// ---- what to do about a row (owner ask, 2026-10-12) --------------------------------------------

/**
 * What the app's own runtime caches say about a name: the wiki was asked and had no page
 * (`noPage`), had one (`hasPage`), or was never asked (`unchecked`). Read, never fetched: the
 * main process answers off `<userData>/item-knowledge-cache.json` / `mob-knowledge-cache.json`
 * (src/main/gapVerdicts.ts); spells have no cache and are always `unchecked`.
 */
/** `otherPage:<title>` / `freeText:<title>`: a page exists under other capitals, or as free text (gapExistingPage.ts). */
export type GapVerdict = 'noPage' | 'hasPage' | 'unchecked' | `otherPage:${string}` | `freeText:${string}`
/** Verdicts by row name, as the renderer's store hands them to the table. */
export type GapVerdicts = Record<string, GapVerdict>

export type GapActionKind = 'fixTitle' | 'addToWiki' | 'rescrape' | 'checkWiki' | 'npcSpell' | 'fixParser'

/** One chip: what to do, why (the tooltip), and where it goes when it is a link. */
export interface GapAction {
  kind: GapActionKind
  label: string
  why: string
  href?: string
}

/** What a page's faction statement says, in words: `(-10) to (-30) (unconfirmed)`, `a lowering of no stated amount`. */
export function pageSaysText(said: string): string {
  const h = decodeFactionAmount(said)
  const guess = h.unconfirmed === true ? ' (unconfirmed)' : ''
  if (h.min === undefined || h.max === undefined) return `${h.side === 'lowers' ? 'a lowering' : 'a raise'} of no stated amount${guess}`
  // The wiki writes the smaller hit first: `(-10) to (-30)`, `(10) to (30)`.
  const [a, b] = Math.abs(h.min) <= Math.abs(h.max) ? [h.min, h.max] : [h.max, h.min]
  return (h.min === h.max ? `(${String(h.min)})` : `(${String(a)}) to (${String(b)})`) + guess
}

/** What the log says of a faction row: its amount, or the side a capped line showed. */
export function logSaysText(row: Pick<GapRow, 'adjust' | 'raised'>): string {
  if (row.adjust !== undefined) return `(${String(row.adjust)})`
  return row.raised === true ? 'a raise (at max standing, no amount)' : 'a lowering (at min standing, no amount)'
}

/** A row about a mob's page (a missing faction, drop or image): its domain is one of these. An image row is the mob itself. */
export const onMobPage = (row: GapRow): boolean => row.domain === 'faction' || row.domain === 'drop' || row.domain === 'image'

/** A faction, drop or image row's mob: the page the missing faction, drop or image goes on. */
export const factionMob = (row: GapRow): string => row.details.sources?.entries[0]?.name ?? ''

/** A faction, drop or image row's subject: its name less the ` (mob)` it is filed under. */
export const factionOf = (row: GapRow): string => row.name.slice(0, Math.max(0, row.name.length - factionMob(row).length - 3))

/** A shape the app's own parsers leave in a name, or null: the words the Fix parser tooltip uses. */
export function parserShape(name: string): string | null {
  if (name.endsWith(' from Reward Chest')) return 'a " from Reward Chest" tail the loot parser left in the item name'
  if (/^(Spell|Song): /.test(name)) return 'a scroll prefix whose spell the catalog does not know'
  if (name.endsWith('*')) return 'a trailing "*"'
  return null
}

/**
 * A spell only mobs were seen casting: no caster is you or a player. A one-word caster is a player
 * unless the mob catalog has the name (`Zazamoukh`), when `isMob` is given.
 */
export function npcOnlySpell(row: GapRow, isMob?: (name: string) => boolean): boolean {
  const casters = row.details.casters?.entries ?? []
  const player = (n: string): boolean => n === 'you' || (/^[A-Z][a-z]+$/.test(n) && isMob?.(n) !== true)
  return row.domain === 'spell' && casters.length > 0 && !casters.some((c) => player(c.name))
}

/** A faction, drop or image row's mob page: the catalog's title when it picked one, else the log's name. */
export const mobPageOf = (row: GapRow): string => row.page ?? factionMob(row)

/** What the chips may say beyond the row: the wiki data's date, and which names are catalog mobs. */
export interface GapActionContext {
  dataDate?: string
  isMob?: (name: string) => boolean
}

/**
 * A drop's chips: which page to update. The wiki connects nothing itself (owner ask, 2026-10-18):
 * the mob page's `|known_loot` and the item page's `|dropsfrom` are each typed by hand.
 */
function dropActions(row: GapRow): GapAction[] {
  const mob = mobPageOf(row)
  const item = factionOf(row)
  const field = row.lootField === 'common_loot' ? ' File it under common_loot.' : ''
  const why =
    row.details.drops !== undefined
      ? `The wiki page for ${mob} lists neither ${item} nor ${row.replaces === undefined ? 'any item in it' : 'the one you looted'}.`
      : row.itemPage === 'namesMob'
        ? `The page for ${item} names ${mob} as a source, but ${mob}'s page does not list it.`
        : `The wiki page for ${mob} does not list ${item}.`
  const actions: GapAction[] = [{ kind: 'checkWiki', label: 'Add to mob page', why: why + field + replaceWhy(item, row.replaces?.lines), href: wikiEditUrl(mob) }]
  if (row.itemPage === 'lacksMob') {
    actions.push({ kind: 'addToWiki', label: 'Add to item page', why: `The page for ${item} does not name ${mob} under dropsfrom.`, href: wikiEditUrl(item) })
  }
  return actions
}

/**
 * What someone must do to close the gap, one or two chips: the page exists under another
 * spelling (fix its title), the wiki was asked and had nothing (add the page), the wiki has it
 * and our data predates it (re-scrape), only mobs cast it (an NPC spell), or the committed data
 * lacks it (check the wiki: a cache miss, not a verdict, owner 2026-10-19) — plus "fix parser"
 * when the name itself carries a parser's leftover.
 */
/** A faction row's chip: add the faction to the mob page, or fix what the page says of it. */
function factionAction(row: GapRow): GapAction {
  const page = mobPageOf(row)
  if (row.noPage === true) return { kind: 'checkWiki', label: 'Check mob page', why: `No page for ${page} in the wiki data; check the wiki before adding this faction.`, href: wikiPageUrl(page) }
  if (row.fix === undefined) return { kind: 'checkWiki', label: 'Edit mob page', why: `The wiki page for ${page} does not list this faction.`, href: wikiEditUrl(page) }
  const why = `The wiki page for ${page} lists this faction as ${pageSaysText(row.pageSays ?? '')}; your log: ${logSaysText(row)}.`
  return { kind: 'checkWiki', label: 'Fix on mob page', why, href: wikiEditUrl(page) }
}

/** An image row's chip: upload the file; the page's imagefilename line added, or fixed when it names another file. */
function imageAction(row: GapRow, file = row.image ?? ''): GapAction {
  const fix = row.pageImage === undefined ? 'add an imagefilename line if the page has none' : `the page's imagefilename says ${row.pageImage}: change it to ${file}`
  return { kind: 'addToWiki', label: 'Upload image', why: `Upload a screenshot as ${file}; ${fix}.`, href: wikiUploadUrl(file) }
}

export function gapActions(row: GapRow, verdict: GapVerdict, ctx: GapActionContext = {}): GapAction[] {
  // A notice row, a redirect row, or a page that exists under other capitals or as free text (gapExistingPage.ts).
  const check = pageCheckAction(row, verdict)
  if (check !== undefined) return [check]
  if (row.domain === 'image') return [imageAction(row)]
  if (row.domain === 'drop') return dropActions(row)
  if (onMobPage(row)) return [factionAction(row)]
  const actions: GapAction[] = []
  const asOf = ctx.dataDate === undefined ? 'the app' : `the wiki data from ${ctx.dataDate}`
  if (row.suggest !== undefined) {
    actions.push({
      kind: 'fixTitle',
      label: 'Fix wiki title',
      why: `The wiki spells it ${row.suggest.name}; Copy wiki page gives a redirect.`,
      href: wikiPageUrl(row.suggest.page)
    })
  } else if (verdict === 'noPage') {
    actions.push({ kind: 'addToWiki', label: 'Add to wiki', why: 'The app asked the wiki for this name and it had no page.' })
  } else if (verdict === 'hasPage') {
    actions.push({ kind: 'rescrape', label: 'Re-scrape', why: `Newer than ${asOf}; the next data refresh picks it up.` })
  } else if (npcOnlySpell(row, ctx.isMob)) {
    actions.push({ kind: 'npcSpell', label: 'NPC spell', why: `Only mobs cast it, and ${asOf} lacks it: an NPC spell page.`, href: wikiSearchUrl(row.name) })
  } else {
    actions.push({ kind: 'checkWiki', label: 'Check wiki', why: `Not in ${asOf}: search the wiki before creating the page.`, href: wikiSearchUrl(row.name) })
  }
  const shape = parserShape(row.name)
  if (shape !== null) actions.push({ kind: 'fixParser', label: 'Fix parser', why: `The name carries ${shape}.` })
  return actions
}

/**
 * `76 unknown` — the toggle's caption for one domain (owner, 2026-10-17: the checked total meant
 * nothing to a player); `3 here` while the "this zone" filter is on, counted off the served rows.
 */
/** The rows the player has hidden: Done (unless Show done) and, with Hide uncertain, the uncertain ones. */
export const hiddenBy =
  (done: ReadonlySet<string>, showDone: boolean, hideUncertain: boolean) =>
  (r: GapRow): boolean =>
    (!showDone && done.has(doneKey(r))) || (hideUncertain && uncertainGap(r))

export function gapsCaption(snap: GapsSnap, domain: GapDomain, zone: string | null = null, hidden: (row: GapRow) => boolean = () => false): string {
  // Rows the player hid (Done, Hide uncertain) are not counted (owner, 2026-10-19: "3 here" over 2 rows).
  if (zone !== null) return `${visibleGaps(snap.rows, domain, '', zone).filter((r) => !hidden(r)).length.toLocaleString()} here`
  const off = snap.rows.filter((r) => r.domain === domain && hidden(r)).length
  return `${Math.max(0, (snap.totals[domain] ?? 0) - off).toLocaleString()} unknown`
}

/** Where the row was named most, and how many other zones: `Befallen 4 (Refined) +2`; '' for none. */
export function gapZone(row: GapRow): string {
  const zones = row.details.zones
  const top = zones?.entries[0]?.name
  if (zones === undefined || top === undefined) return ''
  return zones.distinct > 1 ? `${top} +${zones.distinct - 1}` : top
}

// ---- sorting the table (owner ask, 2026-10-13: every column sorts) ----

export type GapSortKey = 'name' | 'kinds' | 'zone' | 'count' | 'first' | 'last' | 'todo'
export interface GapSort {
  key: GapSortKey
  dir: 'asc' | 'desc'
}
/** The engine's own order: most mentioned first. */
export const DEFAULT_GAP_SORT: GapSort = { key: 'count', dir: 'desc' }

/** A column's first click: counts and dates biggest or newest first, text A to Z. */
export function firstGapSortDir(key: GapSortKey): GapSort['dir'] {
  return key === 'count' || key === 'first' || key === 'last' ? 'desc' : 'asc'
}

function gapSortValue(r: GapRow, key: GapSortKey, verdicts: GapVerdicts): string | number {
  if (key === 'count') return r.count
  if (key === 'name') return r.name.toLowerCase()
  if (key === 'kinds') return r.kinds.join(', ')
  // By the zone it was named in most, A to Z; a row with no zone sorts first.
  if (key === 'zone') return (r.details.zones?.entries[0]?.name ?? '').toLowerCase()
  if (key === 'todo') return gapActions(r, verdicts[r.name] ?? 'unchecked').map((a) => a.label).join(', ')
  // The timestamps are `YYYY-MM-DD HH:MM:SS`, which sort as text.
  return key === 'first' ? r.first : r.last
}

/** The rows in the table's order. A tie keeps the engine's order, so equal rows never shuffle. */
export function sortGaps(rows: readonly GapRow[], sort: GapSort, verdicts: GapVerdicts = {}): GapRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: gapSortValue(r, sort.key, verdicts) }))
    .sort((a, b) => {
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v))
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.r)
}
