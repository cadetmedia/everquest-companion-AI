// shared/wikiPage.ts — the text of a new eqlwiki page for a name the app's data lacks, built from
// what the log saw, for the player to copy into the wiki and finish from a screenshot (owner ask,
// 2026-10-18: "copy paste the marked up stuff with a button").
//
// Built up from parts, the way the wiki's own pages are (`Fire Beetle Eye`): the era banner, the
// template with only the fields the log can fill, the `dropsfrom` zone blocks, bullet lists and
// categories. Drop rates go on the MOB's page, beside each item it dropped, as the wiki keeps them.
//
// The wiki's blueprints for each page (what a full page may hold; this fills only what the log saw):
//   https://eqlwiki.com/Help:Contents#Item_Page_Blueprint
//   https://eqlwiki.com/Help:Contents#NPC_Page_Blueprint
//   https://eqlwiki.com/Help:Contents#Merchant_Page_Blueprint
//   https://eqlwiki.com/Help:Contents#Spell_Page_Blueprint A page holds no field the log has nothing for and no placeholder; the stats are the
// game's to show and the player's to type, so `statsblock` opens with the blueprint's last lines,
// empty, to type into (STATS_SKELETON; owner, 2026-10-20).

import { CURRENT_ERA } from './planner/era'
import type { KillMap } from './kills'
import { killsFor } from './kills'
import { derivedPrices, factionMob, factionOf, npcOnlySpell, type ClientSpellFacts, type GapDomain, type GapRow, type MobCoin } from './gaps'
import { merchantValueOf } from './gapOffers'
import { itemBaseName } from './itemStats'
import { anyMobDrop } from './gapDrops'
import { isRewardChest, mobSourceOf } from './rewardChest'
import { wikiZoneLink } from './gapWikiZone'
import type { VendorFinder } from './gapMobPage'
import type { LootEvent } from './types'
import { npcImageName, withPageTitles } from './mobPageTitle'
import { noticeProof } from './gapNotices'
import { locFinder, questFactsOf, questPageParts, withQuestFields } from './itemQuestFacts'
import { roleClass, roleField, roleOf, withFishedNote } from './gapRoles'
import { questRowPage } from './gapQuestPage'
import type { QuestExtras } from './gapQuests'
import { withFightFields } from './gapFight'
import { itemsSoldBlock, itemsSoldField, type SoldSeen } from './gapItemsSold'
import { pageOrAdd, withDescription, withoutStated, type MerchantExtras, type PageStated } from './gapMerchantDescription'

/** A log zone name as the wiki spells it (shared/gapWikiZone.ts); as printed when none is given. */
export type ZoneNamer = (raw: string) => string
const asPrinted: ZoneNamer = (z) => z

// ---- the parts ---------------------------------------------------------------------------------

/** `{{Classic Era}}`: the era the game is in, which is the era anything the player met is in. */
export function eraBanner(era: string = CURRENT_ERA): string {
  return `{{${era.charAt(0).toUpperCase()}${era.slice(1)} Era}}`
}

export const wikiLink = (page: string): string => `[[${page}]]`

/** Copper as the wiki writes a price: `2s 7c`, `1p 4g`, zero parts left out. */
export function wikiCoin(copper: number): string {
  let rest = Math.max(0, Math.round(copper))
  const parts: string[] = []
  for (const [unit, per] of [['p', 1000], ['g', 100], ['s', 10], ['c', 1]] as const) {
    const n = Math.floor(rest / per)
    rest -= n * per
    if (n > 0) parts.push(`${String(n)}${unit}`)
  }
  return parts.length > 0 ? parts.join(' ') : '0c'
}

/** `dropsfrom`: `[[Zone]]`, a blank line and its mobs, per zone, zones and mobs A to Z. */
export function zoneBlocks(byZone: ReadonlyMap<string, readonly string[]>): string {
  const zones = [...byZone].sort((a, b) => a[0].localeCompare(b[0]))
  const blocks = zones.map(([zone, mobs]) => {
    const list = [...new Set(mobs)].filter((m) => m !== '').sort((a, b) => a.localeCompare(b)).map((m) => `* ${wikiLink(m)}`).join('\n')
    // A zone with no mob (a Reward Chest payout) stands alone, as the wiki's own zone-only blocks do (Tasty Candy).
    return zone === '' ? list : list === '' ? wikiZoneLink(zone) : `${wikiZoneLink(zone)}\n\n${list}`
  })
  return `\n\n${blocks.join('\n\n')}\n`
}

/** One vendor an item was bought from: its page, the zone it stands in, its `/loc` (ns, ew). */
export interface VendorSeen {
  vendor: string
  /** As the wiki spells it; '' when neither the catalog nor the log names one place. */
  zone: string
  loc?: readonly [number, number]
}

/**
 * `soldby` as the wiki writes it on 1,243 of the 1,278 item pages that fill it (review D1, measured
 * on the cached pages 2026-10-19): `{{ItemWhereTable|`, one `{{ItemWhereRow   | [[Zone]] | [[Vendor]]
 * |  | (ns, ew) }}` per vendor, the zone cell padded to 34 and the vendor cell to 30 (one space past a
 * longer link), the third cell (directions) 15 spaces, the table closed on its own line. A vendor
 * whose spot is unknown leaves the loc cell empty, `|  }}`, as real pages do. Zones then vendors A to Z, an unplaced vendor last.
 */
export function itemWhereTable(vendors: readonly VendorSeen[]): string {
  const cell = (link: string, width: number): string => `${link.padEnd(width - 1)} `
  const unplaced = (v: VendorSeen): number => Number(v.zone === '')
  const sorted = [...vendors].sort((a, b) => unplaced(a) - unplaced(b) || a.zone.localeCompare(b.zone) || a.vendor.localeCompare(b.vendor))
  const rows = sorted.map((v) => {
    const zone = v.zone === '' ? '' : wikiZoneLink(v.zone)
    const loc = v.loc === undefined ? '' : `(${String(v.loc[0])}, ${String(v.loc[1])})`
    return `{{ItemWhereRow   | ${cell(zone, 34)}| ${cell(wikiLink(v.vendor), 30)}|${' '.repeat(15)}| ${loc} }}`
  })
  return `\n\n{{ItemWhereTable|\n${rows.join('\n')}\n}}\n`
}

/** `<onlyinclude>{{Itempage` and one `|key = value` line per field, only the fields given. */
export function templateBlock(template: string, fields: readonly (readonly [string, string])[], onlyinclude = true): string {
  const body = `{{${template}\n${fields.map(([k, v]) => `|${k} = ${v}`).join('\n')}\n}}`
  return onlyinclude ? `<onlyinclude>${body}</onlyinclude>` : body
}

export function categoryLines(names: readonly string[]): string {
  return [...new Set(names)].map((n) => `[[Category:${n}]]`).join('\n')
}

/** The page: the banner, the template, then the categories when there are any. */
function page(template: string, cats: readonly string[]): string {
  return [eraBanner(), template, ...(cats.length > 0 ? ['', categoryLines(cats)] : [])].join('\n') + '\n'
}

// ---- what the log saw ---------------------------------------------------------------------------

/** One mob an item was looted from, where, and how often. */
export interface DropSeen {
  zone: string
  /** '' for a Reward Chest payout: its zone stands, no mob (owner, 2026-10-21) */
  mob: string
  drops: number
}

export interface ItemFacts {
  name: string
  drops: DropSeen[]
  /** What a vendor pays at best standing, in copper: an ally offer, else `derivedPrices` (`merchantValueOf`). */
  merchantValue?: number
  /** Merchants the player bought it from. */
  soldBy: VendorSeen[]
  /** The player made it in a combine (a mote fusion is not one). */
  crafted: boolean
  /** The quest sentences for `|notes` and the `|relatedquests` list (shared/itemQuestFacts.ts). */
  questNote?: string
  relatedQuests?: string
}

/** A faction a kill moved: the amount most lines stated, and whether the kill raised it. */
export interface FactionSeen {
  faction: string
  adjust?: number
  /** From the amount's sign or a capped line's "better" / "worse"; absent when neither said. */
  raised?: boolean
}

export interface MobFacts {
  name: string
  zones: string[]
  /** The levels its /con lines stated. */
  levels: number[]
  /** Items looted from it, and on how many corpses. */
  loot: { item: string; drops: number }[]
  /** How many of it the player killed: the drop rates' denominator. */
  kills: number
  /** The player's own killing blows, whose faction lines the log always prints: with none seen, the page can say none. */
  credited: number
  /** The player's own killing blows: with LOOT_NONE_KILLS of them and nothing looted, the page says no loot. */
  ownKills: number
  /** Where a con or hail beside a `/loc` placed it, in `/loc`'s order (y, x, z). */
  points: number[][]
  factions: FactionSeen[]
  /** What its attack lines showed it doing (`Rampages`, `Flurries`): the page's `special`. */
  specials: string[]
  /** What its corpse paid at the player's kills; absent when no kill paid (never "none", gaps_coin.rs). */
  coin?: MobCoin
  /** The quests whose task lines came just after it spoke or took an item (gaps_quests.rs): `related_quests`. */
  quests?: string[]
  /** Its role from the client's target line (`Banker`, `Merchant`, `Warrior GM`; gaps_roles.rs). */
  role?: string
  /** What it quoted or sold the player, a merchant page's `items_sold` (gaps_stock.rs, shared/gapItemsSold.ts). */
  itemsSold?: SoldSeen[]
}

/** What the log saw of mobs beyond the rows: each kill's factions and each mob's `/loc` points. */
export interface MobSightings {
  killFactions?: readonly ({ mob: string } & FactionSeen)[]
  mobLocs?: readonly { mob: string; points: number[][] }[]
  mobSpecials?: readonly { mob: string; specials: readonly string[] }[]
  mobCoin?: readonly MobCoin[]
  /** The player's own pets: a kill by one is a kill of the player's (owner, 2026-10-22: Gonekn). */
  ownPets?: readonly string[]
}

export interface SpellFacts {
  name: string
  /** Only mobs were seen casting it. */
  npcOnly: boolean
  /** What the install's spell files state (src/main/gapSpellFacts.ts); absent when not asked or not found. */
  client?: ClientSpellFacts
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
/** An item at any tier is one item (owner, 2026-10-19): `Rusty Sword +4` is `Rusty Sword`. */
const itemKey = (name: string): string => itemBaseName(name).toLowerCase()
/** One corpse: a loot line per copy of an item prints the same second from the same corpse. */
const corpseOf = (e: LootEvent): string => `${String(e.ts)}|${(e.source ?? '').toLowerCase()}`

/** The row's zones as the wiki spells them, each once. */
function rowZones(row: GapRow, zoneName: ZoneNamer): string[] {
  const raw = row.details.zones?.all ?? row.details.zones?.entries.map((e) => e.name) ?? []
  return [...new Set(raw.map(zoneName).filter((z) => z !== ''))]
}

/** Every (zone, mob) the ledger looted the item from, at any tier, with the corpses that dropped it; a chest payout gives its zone and no mob. */
export function dropsSeen(item: string, loot: readonly LootEvent[], zoneName: ZoneNamer = asPrinted): DropSeen[] {
  const byPair = new Map<string, DropSeen & { corpses: Set<string> }>()
  for (const e of loot) {
    if (e.source === undefined || itemKey(e.item) !== itemKey(item)) continue
    const mob = mobSourceOf(e) ?? ''
    const zone = zoneName(e.zone ?? '')
    if (mob === '' && zone === '') continue
    const key = `${zone.toLowerCase()}|${mob.toLowerCase()}`
    const seen = byPair.get(key) ?? { zone, mob, drops: 0, corpses: new Set<string>() }
    seen.corpses.add(corpseOf(e))
    seen.drops = seen.corpses.size
    byPair.set(key, seen)
  }
  return [...byPair.values()].map(({ zone, mob, drops }) => ({ zone, mob, drops }))
}

/**
 * A vendor's row: its catalog page, zone and single spawn point when the catalog can tell which page
 * (`vendorFinder`), else its name as printed and the item's one zone, if it was seen in only one.
 */
function vendorSeen(vendor: string, zones: readonly string[], zoneName: ZoneNamer, vendorAt?: VendorFinder): VendorSeen {
  const at = vendorAt?.(vendor, zones)
  const zone = at?.zone !== undefined ? zoneName(at.zone) : zones.length === 1 ? (zones[0] ?? '') : ''
  return { vendor: at?.page ?? vendor, zone, ...(at?.loc === undefined ? {} : { loc: at.loc }) }
}

export function itemFacts(row: GapRow, loot: readonly LootEvent[], zoneName: ZoneNamer = asPrinted, vendorAt?: VendorFinder): ItemFacts {
  const drops = dropsSeen(row.name, loot, zoneName)
  const mobs = new Set(drops.map((d) => d.mob.toLowerCase()))
  const bought = row.kinds.includes('bought')
  const vendors = bought ? (row.details.sources?.entries ?? []).map((e) => e.name).filter((n) => !mobs.has(n.toLowerCase()) && !isRewardChest(n)) : []
  const soldBy = vendors.map((v) => vendorSeen(v, rowZones(row, zoneName), zoneName, vendorAt))
  // A merchant's offer heard at ally wins over the instant-sale estimate; any other never stands in
  // for it (shared/gapOffers.ts `merchantValueOf`, owner ask 2026-10-20).
  const merchantValue = merchantValueOf(row.details, derivedPrices(row.details)?.vendorValue)
  return { name: row.name, drops, soldBy, crafted: row.kinds.includes('crafted'), ...(merchantValue === undefined ? {} : { merchantValue }) }
}

/** The levels a mob row's /con lines stated (`L12 indifferent`), lowest first. */
function conLevels(row: GapRow): number[] {
  const levels = (row.details.cons?.entries ?? []).flatMap((e) => {
    const m = /^L(\d+)/.exec(e.name)
    return m ? [Number(m[1])] : []
  })
  return [...new Set(levels)].sort((a, b) => a - b)
}

/** What the ledger looted from the mob, by base item, on how many corpses, A to Z. */
function mobLoot(row: GapRow, loot: readonly LootEvent[]): MobFacts['loot'] {
  const byItem = new Map<string, { item: string; corpses: Set<string> }>()
  for (const e of loot) {
    const mob = mobSourceOf(e)
    if (mob === undefined || !same(mob, row.name)) continue
    const seen = byItem.get(itemKey(e.item)) ?? { item: itemBaseName(e.item), corpses: new Set<string>() }
    seen.corpses.add(corpseOf(e))
    byItem.set(itemKey(e.item), seen)
  }
  const out = new Map([...byItem].map(([k, v]) => [k, { item: v.item, drops: v.corpses.size }]))
  // The row's own drop list names what the ledger may not hold (lines, not corpses: no better count).
  for (const d of row.details.drops?.entries ?? []) {
    const had = out.get(itemKey(d.name))
    if (!byItem.has(itemKey(d.name))) out.set(itemKey(d.name), { item: itemBaseName(d.name), drops: (had?.drops ?? 0) + d.n })
  }
  return [...out.values()].sort((a, b) => a.item.localeCompare(b.item))
}

/**
 * The player's own killing blows on the row's mob (its `killed by` tally). A kill of your own prints
 * its faction lines whether or not it pays experience (owner's log, 2026-10-19: 1,657 of 4,525 own
 * kills with no experience line printed faction lines), so it proves none as a credited kill does;
 * a gray mob never credits.
 */
function ownKills(row: GapRow, pets: readonly string[] = []): number {
  // `pets`: the player's own pets' kills too, for the LOOT rule only: their corpses are the player's
  // to loot. Never for factions: a pet's kill while the player is feigned moves no faction (owner,
  // 2026-10-22: "Pets killing faction, while i'm Feign Death, don't give faction"), so a pet kill with
  // no faction lines proves nothing; faction lines seen at any kill prove them on their own.
  const mine = new Set(['you', ...pets.map((p) => p.toLowerCase())])
  return (row.details.killers?.entries ?? []).filter((e) => mine.has(e.name.toLowerCase())).reduce((n, e) => n + e.n, 0)
}

/** `kills` must be a `killIndex` result, as `killsFor` asks. */
export function mobFacts(row: GapRow, loot: readonly LootEvent[], kills: KillMap, seen: MobSightings & { zoneName?: ZoneNamer } = {}): MobFacts {
  const zoneName = seen.zoneName ?? asPrinted
  const mine = (m: { mob: string }): boolean => same(m.mob, row.name)
  const killed = killsFor(kills, row.name)
  return {
    name: row.name,
    zones: rowZones(row, zoneName),
    levels: conLevels(row),
    loot: mobLoot(row, loot),
    kills: killed?.count ?? 0,
    // Only the player's own killing blows prove "no factions". An experience-credited kill does not:
    // a pet's kill while the player is feigned pays experience and moves no faction (owner's log,
    // 2026-10-23: Gonekn killed Guard S`Tal, "You gain experience!", no faction line; owner: "this
    // is dangerous to say None when it's not none"), and `X died.` never says whose kill it was.
    credited: ownKills(row),
    ownKills: ownKills(row, seen.ownPets),
    points: (seen.mobLocs ?? []).filter(mine).flatMap((m) => m.points),
    specials: [...new Set((seen.mobSpecials ?? []).filter(mine).flatMap((m) => m.specials))],
    ...coinOf(seen.mobCoin, row.name),
    quests: questFactsOf(row)?.quests ?? [],
    ...roleField(row),
    ...itemsSoldField(row),
    factions: (seen.killFactions ?? []).filter(mine).map(({ faction, adjust, raised }) => ({
      faction,
      ...(adjust === undefined ? {} : { adjust }),
      ...(raised === undefined ? {} : { raised })
    }))
  }
}

// ---- the pages ------------------------------------------------------------------------------------

/**
 * The rarity word the wiki's own lines put beside a rate, from the bands they use (9,806 measured
 * 2026-10-18; medians 1%, 10%, 27.5%, 56%, 100%).
 */
export function rarityWord(pct: number): string {
  if (pct >= 100) return 'Always'
  if (pct >= 50) return 'Common'
  if (pct >= 25) return 'Uncommon'
  if (pct >= 5) return 'Rare'
  return 'Ultra Rare'
}

/**
 * One `known_loot` line in the wiki's own shape (owner, 2026-10-18): the rarity word in its `drare`
 * span and the rate in its `ddb` span, `[Overall: ~64%]`. The rate is the corpses that dropped it
 * over the player's kills, `~` marking it as seen in one log rather than the server's loot table.
 */
export function lootLine(item: string, drops: number, kills: number): string {
  return rateLine(`{{:${item}}}`, drops, kills)
}

/**
 * A group's line (`[[Rusty Weapons]]`), rated the same way (review D2): the corpses that dropped
 * ANY member, over the mob's kills. The wiki writes a group line exactly as an item line, the
 * `drare` and `ddb` spans after the link (measured 2026-10-19 on the cached mob pages, 468 group
 * lines: `<li> [[Rusty Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>...`).
 */
export function groupLine(group: string, drops: number, kills: number): string {
  return rateLine(wikiLink(group), drops, kills)
}

/**
 * A group line replacing a page's member lines (owner, 2026-10-21): rated by the page's own member
 * rates summed when it states them all (`replaces.rate`), else by the log as any group line.
 */
function replaceLine(row: GapRow, kills: number): string {
  const rate = row.replaces?.rate
  return rate === undefined ? groupLine(factionOf(row), row.count, kills) : pctLine(wikiLink(factionOf(row)), rate)
}

/**
 * Kills of a mob before its loot lines carry a rate and a rarity word (owner, 2026-10-20: "are we a
 * bit overconfident ... I killed this guy 1 time and you have things listed as rare and always?").
 * The same bar as `* None`: under it the line is the item alone.
 */
export const RATE_MIN_KILLS = 10

/** `<li> link </li>`, with the rarity word and the rate only when the log gives one. */
function rateLine(link: string, drops: number, kills: number): string {
  // More drops than kills means kills the log never showed (a groupmate's far kill): no rate beats a false "Always".
  if (kills < RATE_MIN_KILLS || drops > kills) return `<li> ${link} </li>`
  return pctLine(link, Math.round((drops / kills) * 1000) / 10)
}

function pctLine(link: string, pct: number): string {
  return `<li> ${link} <span class='drare'>(${rarityWord(pct)})</span> <span class='ddb'>[Overall: ~${String(pct)}%]</span> </li>`
}

/**
 * The Item Page Blueprint's closing `statsblock` lines, empty, for the player to type from the
 * item's window (owner, 2026-10-20: "items need the WT stat so i can fill it in", "use the template
 * data"). Read from https://eqlwiki.com/Help:Contents#Item_Page_Blueprint on 2026-10-20: `Size: ...
 * WT: 0.0<br>`, `Class: ...<br>`, `Race: ALL<br>`, in that order. Only these: the owner ruled
 * (2026-10-18) that a page carries no blueprint option lists; a flags line (`Quest<br>`) and gear
 * lines (Slot, AC, stats) go above them when the item has them.
 */
export const STATS_SKELETON = '\nSize:   WT: <br>\nClass: <br>\nRace: <br>'

export function itemPage(f: ItemFacts): string {
  const byZone = new Map<string, string[]>()
  for (const d of f.drops) byZone.set(d.zone, [...(byZone.get(d.zone) ?? []), d.mob])
  const fields: [string, string][] = [['itemname', f.name]]
  if (f.merchantValue !== undefined) fields.push(['merchant_value', wikiCoin(f.merchantValue)])
  fields.push(['statsblock', STATS_SKELETON])
  if (byZone.size > 0) fields.push(['dropsfrom', zoneBlocks(byZone)])
  if (f.soldBy.length > 0) fields.push(['soldby', itemWhereTable(f.soldBy)])
  const cats = [
    ...(f.soldBy.length > 0 ? ['Vendor Sold'] : []),
    ...(f.crafted ? ['Player Crafted'] : []),
    ...[...byZone.keys()].filter((z) => z !== '').sort((a, b) => a.localeCompare(b))
  ]
  return page(templateBlock('Itempage', withQuestFields(fields, f)), cats)
}

// ---- NPC and merchant pages: the blueprints' full layout ------------------------------------------
//
// Unlike an item page, an NPC page keeps every field of its template, filled or blank (owner,
// 2026-10-18, with a real page): the blueprint's order and its `| key<padding> = value` alignment,
// a blank line between the groups. What the log fills is filled; the rest waits for the screenshot.

/** The NPC Page Blueprint's fields; '' is a blank line between groups. */
const NPC_LAYOUT = ['imagefilename', '', 'name', 'race', 'class', 'level', 'agro_radius', 'run_speed', '', 'zone', 'location', 'respawn_time', '', 'AC', 'HP', 'HP_regen', 'mana_regen', '', 'attacks_per_round', 'attack_speed', 'damage_per_hit', 'special', '', 'description', '', 'known_loot', '', 'common_loot', '', 'factions', '', 'opposing_factions', '', 'related_quests', '']
/** The Merchant Page Blueprint's: no loot, `items_sold` instead (what the merchant quoted or sold the player). */
const MERCHANT_LAYOUT = ['imagefilename', '', 'name', 'race', 'class', 'level', 'agro_radius', 'run_speed', '', 'zone', 'location', '', 'AC', 'HP', 'HP_regen', 'mana_regen', '', 'attacks_per_round', 'attack_speed', 'damage_per_hit', 'special', 'description', '', 'items_sold', '', 'factions', '', 'opposing_factions', '', 'related_quests', '']
/** The fields whose value is a block under the key, not a word beside it. */
const BLOCK_FIELDS = new Set(['description', 'known_loot', 'common_loot', 'items_sold', 'factions', 'opposing_factions', 'related_quests'])

/** `{{Namedmobpage` in its blueprint's layout, `values` filling what they name. */
export function layoutBlock(template: string, layout: readonly string[], values: Readonly<Record<string, string>>): string {
  const lines = layout.map((key) => {
    if (key === '') return ''
    const v = values[key] ?? ''
    return BLOCK_FIELDS.has(key) ? `| ${key} = ${v === '' ? '' : `\n\n${v}`}` : `| ${key.padEnd(17)} = ${v}`
  })
  return `{{${template}\n\n${lines.join('\n')}\n}}`
}

// The NPC picture's name lives in mobPageTitle.ts, a leaf the quest page writer imports too.
export { npcImageName }

/** `/loc` points as the wiki writes `|location`: `(-791, 173), (10, -21)`. */
const locationText = (points: readonly number[][]): string => points.map((p) => `(${String(p[0])}, ${String(p[1])})`).join(', ')

/** A faction a kill raised: by its amount's sign, else a capped line's word. */
const raises = (f: FactionSeen): boolean | undefined => (f.adjust !== undefined && f.adjust !== 0 ? f.adjust > 0 : f.raised)

/** One faction bullet as a mob page lists it; the amount in its span when a line stated one. */
export function factionLine(f: FactionSeen): string {
  const up = raises(f)
  const css = up === true ? 'oppfac' : 'profac'
  // A capped line (`could not possibly get any better`) states the side and no amount: the sign alone,
  // as the wiki writes an unknown amount (`(+)` 27 pages, `(-)` 82) (owner, 2026-10-22: "indicate it's
  // a POSITIVE increase, even if we don't know the amount").
  const amount = f.adjust !== undefined ? String(f.adjust) : up === undefined ? undefined : up ? '+' : '-'
  return `* ${wikiLink(f.faction)}${amount === undefined ? '' : ` <span class='${css}'>(${amount})</span>`}`
}

/**
 * A kill's factions as the page lists them: lowered under `factions`, raised under
 * `opposing_factions`; one whose direction no line stated is left out. With kills that credited
 * the player and no faction line in that list, the log has shown there are none (owner, 2026-10-19).
 */
function factionBlocks(factions: readonly FactionSeen[], credited: number): Record<string, string> {
  const block = (lines: string[]): string => (lines.length > 0 ? lines.join('\n') : credited > 0 ? '* None' : '')
  return {
    factions: block(factions.filter((f) => raises(f) === false).map(factionLine)),
    opposing_factions: block(factions.filter((f) => raises(f) === true).map(factionLine))
  }
}

/** `description`: a new merchant page's, from its nameplate, its items and its hail answer (gapMerchantDescription.ts). */
type NpcFacts = Pick<MobFacts, 'name' | 'zones' | 'levels' | 'points' | 'factions' | 'credited' | 'specials' | 'quests' | 'role' | 'itemsSold'> & { description?: string; stated?: PageStated }

/** The values both NPC layouts share: image, name, level, zone, location, factions, quests. */
function npcValues(f: NpcFacts): Record<string, string> {
  const lo = f.levels[0]
  const hi = f.levels.at(-1)
  return {
    imagefilename: npcImageName(f.name),
    name: f.name,
    class: roleClass(f.role) ?? '',
    // The wiki writes a range unspaced, `11-13`, four times in five.
    level: lo === undefined || hi === undefined ? '' : lo === hi ? String(lo) : `${String(lo)}-${String(hi)}`,
    zone: f.zones.map(wikiZoneLink).join(', '),
    location: locationText(f.points),
    special: f.specials.join(', '),
    related_quests: (f.quests ?? []).map((q) => `* [[${q}]]`).join('\n'),
    ...factionBlocks(f.factions, f.credited)
  }
}

/** Loot lines in the wiki's list; '' for none. */
const lootList = (loot: MobFacts['loot'], kills: number): string =>
  loot.length === 0 ? '' : `<ul>\n${loot.map((l) => lootLine(l.item, l.drops, kills)).join('\n')}\n</ul>`

/** The mob's coin, when its kills paid any. */
function coinOf(all: readonly MobCoin[] | undefined, mob: string): { coin?: MobCoin } {
  const hit = all?.find((c) => same(c.mob, mob))
  return hit === undefined || hit.n === 0 ? {} : { coin: hit }
}

/** The page's coins, in its order, with the colour each line's span carries. */
const COINS: readonly (readonly [string, string])[] = [
  ['Platinums', '#e5e4e2'],
  ['Golds', 'gold'],
  ['Silvers', 'silver'],
  ['Coppers', '#CD7F32']
]

/**
 * `MONEY DROPS` as the wiki writes it at the end of `|known_loot` (review E3; measured 2026-10-19 on
 * the cached mob pages, 406 blocks): each coin's least and most over the kills that paid,
 * `<li> 9 - 16 <span style="color:silver"><b>Silvers</b></span></li>`, every coin listed. The log
 * cannot prove a mob pays nothing (gaps_coin.rs), so `NO MONEY DROPS` is never written.
 */
export function moneyBlock(c: MobCoin): string {
  const lines = COINS.map(([word, color], i) => `<li> ${String(c.min[i] ?? 0)} - ${String(c.max[i] ?? 0)} <span style="color:${color}"><b>${word}</b></span></li>`)
  return ['<p><b>MONEY DROPS</b></p>', '<ul>', ...lines, '</ul>'].join('\n')
}

/**
 * Own kills with nothing looted that prove a mob drops no items (owner, 2026-10-20: "Loot is always
 * given even if i'm Feign Death and my pet kills"). Ten, so a rare drop is not called none after a
 * kill or two. Coin is apart: its MONEY DROPS block still follows when a kill paid.
 */
export const LOOT_NONE_KILLS = RATE_MIN_KILLS

/**
 * A mob's page. A drop the wiki files under `|common_loot` (shared loot, `commonLootNames`) goes
 * there; everything else is the mob's own `|known_loot` (owner, 2026-10-19).
 */
export function mobPage(facts: MobFacts, commonLoot: ReadonlySet<string> = new Set()): string {
  // A mote drops from anything: never the mob's loot (anyMobDrop).
  const f = { ...facts, loot: facts.loot.filter((l) => !anyMobDrop(l.item)) }
  const isCommon = (l: MobFacts['loot'][number]): boolean => commonLoot.has(l.item.toLowerCase())
  const loot = f.loot.length === 0 && f.ownKills >= LOOT_NONE_KILLS ? '* None' : lootList(f.loot.filter((l) => !isCommon(l)), f.kills)
  const own = [loot, f.coin === undefined ? '' : moneyBlock(f.coin)].filter((s) => s !== '').join('\n')
  const shared = lootList(f.loot.filter(isCommon), f.kills)
  return page(layoutBlock('Namedmobpage', NPC_LAYOUT, { ...npcValues(f), known_loot: own, common_loot: shared }), f.zones)
}

/** The client facts as Spell Page Blueprint fields, in its order; only what the files stated. */
function clientFields(c: ClientSpellFacts | undefined): string[] {
  if (c === undefined) return []
  const one = (k: string, v: string | number | undefined): string[] => (v === undefined || v === '' ? [] : [`| ${k} = ${String(v)}`])
  return [
    ...one('mana', c.mana),
    ...one('range', c.range),
    ...one('casting_time', c.castTime),
    ...one('recast_time', c.recastTime),
    ...one('resist', c.resist),
    ...one('msg_cast_on_you', c.msgOnYou),
    ...one('msg_cast_on_other', c.msgOnOther),
    ...one('msg_wears_off', c.msgWearsOff)
  ]
}

/** `| classes =` with each class and level the files state, or the NPC-only line when none can scribe it. */
function classesField(f: SpellFacts): string[] {
  const classes = f.client?.classes ?? []
  if (classes.length > 0) return [`| classes =\n\n${classes.map((c) => `* [[${c.cls}]] - Level ${String(c.level)}`).join('\n')}`]
  return f.npcOnly ? ['| classes =\n\nThis spell is cast by NPCs only.'] : []
}

/** The wiki's Spell Page Blueprint layout: `{{Spellpage|`, blank lines between, `| key = value`. */
export function spellPage(f: SpellFacts): string {
  const fields = [`| spellname = ${f.name}`, ...classesField(f), ...clientFields(f.client)]
  const body = `{{Spellpage|\n\n${fields.join('\n\n')}\n\n}}`
  const npcOnly = f.npcOnly && (f.client?.classes.length ?? 0) === 0
  return page(`\n${body}`, npcOnly ? ['NPC Only Spells'] : [])
}

/**
 * A trader the wiki lacks as a merchant, in the Merchant Page Blueprint's layout. `items_sold` lists
 * what the merchant quoted or sold the player (shared/gapItemsSold.ts). The owner left it open on
 * 2026-10-18 (a merchant's stock mixes player resells the log cannot tell apart) and reversed that on
 * 2026-10-23 ("why doesn't our merchant page show items sold?"): a resell may appear, for the player
 * to prune before saving the page.
 */
export function merchantPage(f: NpcFacts): string {
  return pageOrAdd(f, { ...npcValues(f), class: '[[Merchant]]', description: f.description ?? '', items_sold: itemsSoldBlock(f.itemsSold ?? []) }, (v) => page(layoutBlock('MerchantPage', MERCHANT_LAYOUT, v), f.zones))
}

/** What the tab knows beside the row and the ledgers: the wiki's zone spellings and its mobs. */
/** `questEntry` / `questJournal`: a quest's catalog entry and its Quest Journal reading (gapQuests.ts). */
export interface PageExtras extends QuestExtras, MerchantExtras {
  zoneName?: ZoneNamer
  /** A name the mob catalog has: a one-word caster that is a mob, not a player. */
  isMob?: (name: string) => boolean
  /** Drop names the wiki files under `|common_loot`, lower-cased (`commonLootNames`). */
  commonLoot?: ReadonlySet<string>
  /** What the install's spell files state, by spell name. */
  spellFacts?: Readonly<Record<string, ClientSpellFacts>>
  /** Where a vendor stands, by the catalog (`vendorFinder`): an item page's `|soldby` rows. */
  vendorAt?: VendorFinder
  /** A mob's page title, by the catalog (`mobPageFinder`): the links take it, not the log's spelling. */
  mobPage?: (name: string) => string | undefined
}

/**
 * The page for one Gaps row; a faction row gives the bullet its mob's `|factions` takes. A row the
 * wiki has under another spelling (`suggest`) gets a redirect from the game's spelling instead of a
 * second page (owner, 2026-10-11). `kills` must be a `killIndex` result.
 */
export function wikiPageText(row: GapRow, loot: readonly LootEvent[], kills: KillMap, seen: MobSightings & PageExtras = {}): string {
  if (row.suggest !== undefined && (row.domain === 'item' || row.domain === 'spell' || row.domain === 'zone')) return `#REDIRECT [[${row.suggest.page}]]\n`
  return PAGE_OF[row.domain](row, { ...seen, loot, kills, seen, zoneName: seen.zoneName ?? asPrinted })
}

interface PageContext extends Omit<PageExtras, 'zoneName'> {
  loot: readonly LootEvent[]
  kills: KillMap
  seen: MobSightings
  zoneName: ZoneNamer
}

/**
 * Each domain's page, or the one line a mob's page lacks (a faction, image or drop row). A table,
 * so a new domain is one entry, and a domain without one does not compile.
 */
const PAGE_OF: Record<GapDomain, (row: GapRow, c: PageContext) => string> = {
  item: (row, c) => itemPage({ ...withPageTitles(itemFacts(row, c.loot, c.zoneName, c.vendorAt), c.mobPage), ...withFishedNote(questPageParts(questFactsOf(row), { mobPage: c.mobPage, zoneName: c.zoneName, locOf: locFinder(c.seen.mobLocs) }), row, c.zoneName) }),
  // A mob its target line calls a merchant takes the merchant layout before any trade (owner, 2026-10-22);
  // a new mob page takes its fight estimates in its blank fields (shared/gapFight.ts).
  mob: (row, c) => (roleOf(row) === 'Merchant' ? merchantPage(withDescription(mobFacts(row, [], c.kills, { ...c.seen, zoneName: c.zoneName }), row, c)) : withFightFields(mobPage(mobFacts(row, c.loot, c.kills, { ...c.seen, zoneName: c.zoneName }), c.commonLoot), row)),
  merchant: (row, c) => merchantPage(withDescription(mobFacts(row, [], c.kills, { ...c.seen, zoneName: c.zoneName }), row, c)),
  spell: (row, c) => spellPage({ name: row.name, npcOnly: npcOnlySpell(row, c.isMob), client: c.spellFacts?.[row.name] }),
  faction: (row) => `${factionLine({ faction: factionOf(row), adjust: row.adjust, raised: row.raised })}\n`,
  image: (row) => `| ${'imagefilename'.padEnd(17)} = ${row.image ?? ''}\n`,
  notice: (row) => noticeProof(row),
  // A Zones row is always a redirect (gapZoneRedirects.ts); `wikiPageText` answers it above.
  zone: (row) => `#REDIRECT [[${row.suggest?.page ?? row.name}]]\n`,
  quest: (row, c) => questRowPage(row, { zoneName: c.zoneName, mobPage: c.mobPage, entry: c.questEntry?.(row.name), journal: c.questJournal?.(row.name), players: c.players }),
  // A drop: its group's link (`[[Rusty Weapons]]`), else the item; each with the rate seen, a
  // group's being the corpses that dropped any member (the row's count) over the mob's kills.
  drop: (row, c) => {
    const kills = killsFor(c.kills, factionMob(row))?.count ?? 0
    return `${row.replaces ? replaceLine(row, kills) : (row.details.drops ? groupLine : lootLine)(factionOf(row), row.count, kills)}\n`
  }
}

/** The domains whose page needs the same thing whatever the log saw; mobs and merchants are read below. */
const NEEDED_OF: Partial<Record<GapDomain, (row: GapRow) => string[]>> = {
  item: () => ['stats (the item window)'],
  spell: () => ['spell details (its description window)'],
  faction: (row) => (row.adjust === undefined ? ['the amount (a kill that is not capped)'] : []),
  drop: () => [],
  image: () => [],
  notice: () => [],
  quest: () => []
}

/**
 * The page fields the log left blank for this row, in the player's words, so the details can say
 * what to collect before the trip ends (review 2026-10-19). `kills` must be a `killIndex` result.
 */
export function stillNeeded(row: GapRow, loot: readonly LootEvent[], kills: KillMap, seen: MobSightings & MerchantExtras = {}): string[] {
  // A redirect row asks for a check in game, nothing to collect (gapRedirects.ts).
  if (row.viaRedirect !== undefined) return []
  const fixed = NEEDED_OF[row.domain]
  if (fixed !== undefined) return fixed(row)
  const f = mobFacts(row, row.domain === 'mob' ? loot : [], kills, seen)
  // An Update row asks only for what its page lacks (owner, 2026-10-23; gapMerchantDescription.ts).
  return withoutStated(row, seen, [
    ...(f.levels.length === 0 ? ['level (/con)'] : []),
    ...(f.points.length === 0 ? ['location (/loc beside a hail or /con)'] : []),
    // Faction lines seen at a kill of the mob are the proof itself, whoever's kill it was.
    ...(row.domain === 'mob' && f.credited === 0 && f.factions.length === 0 ? ['factions (a kill of your own)'] : []),
    'image (a screenshot)'
  ])
}
