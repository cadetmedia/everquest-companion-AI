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
// game's to show and the player's to type, so `statsblock` is left open.

import { CURRENT_ERA } from './planner/era'
import type { KillMap } from './kills'
import { killsFor } from './kills'
import { derivedPrices, factionMob, factionOf, npcOnlySpell, type GapRow } from './gaps'
import type { LootEvent } from './types'

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

/** A list value: a blank line, then `* [[page]]` per page. */
export function bulletLinks(pages: readonly string[]): string {
  return `\n\n${pages.map((p) => `* ${wikiLink(p)}`).join('\n')}\n`
}

/** `dropsfrom`: `[[Zone]]`, a blank line and its mobs, per zone, zones and mobs A to Z. */
export function zoneBlocks(byZone: ReadonlyMap<string, readonly string[]>): string {
  const zones = [...byZone].sort((a, b) => a[0].localeCompare(b[0]))
  const blocks = zones.map(([zone, mobs]) => {
    const list = [...mobs].sort((a, b) => a.localeCompare(b)).map((m) => `* ${wikiLink(m)}`).join('\n')
    return zone === '' ? list : `${wikiLink(zone)}\n\n${list}`
  })
  return `\n\n${blocks.join('\n\n')}\n`
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
  mob: string
  drops: number
}

export interface ItemFacts {
  name: string
  drops: DropSeen[]
  /** What a vendor pays at best standing, in copper (`derivedPrices`). */
  merchantValue?: number
  /** Merchants the player bought it from. */
  soldBy: string[]
  /** The player made it in a combine. */
  crafted: boolean
}

export interface MobFacts {
  name: string
  zones: string[]
  /** The levels its /con lines stated. */
  levels: number[]
  /** Items looted from it, and how many times. */
  loot: { item: string; drops: number }[]
  /** How many of it the player killed: the drop rates' denominator. */
  kills: number
  /** Where a con or hail beside a `/loc` placed it, in `/loc`'s order (y, x, z). */
  points: number[][]
  /** The factions its kills moved, with the last amount a line stated. */
  factions: { faction: string; adjust?: number }[]
}

/** What the log saw of mobs beyond the rows: each kill's factions and each mob's `/loc` points. */
export interface MobSightings {
  killFactions?: readonly { mob: string; faction: string; adjust?: number }[]
  mobLocs?: readonly { mob: string; points: number[][] }[]
}

export interface SpellFacts {
  name: string
  /** Only mobs were seen casting it. */
  npcOnly: boolean
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** The row's zones, every one when the engine kept the full list. */
function rowZones(row: GapRow): string[] {
  return row.details.zones?.all ?? row.details.zones?.entries.map((e) => e.name) ?? []
}

/** Every (zone, mob) the ledger looted the item from, with the drop count. */
export function dropsSeen(item: string, loot: readonly LootEvent[]): DropSeen[] {
  const byPair = new Map<string, DropSeen>()
  for (const e of loot) {
    if (e.source === undefined || !same(e.item, item)) continue
    const zone = e.zone ?? ''
    const key = `${zone.toLowerCase()}|${e.source.toLowerCase()}`
    const seen = byPair.get(key) ?? { zone, mob: e.source, drops: 0 }
    // Corpses, not the stack's size: a rate is drops per kill.
    seen.drops += 1
    byPair.set(key, seen)
  }
  return [...byPair.values()]
}

export function itemFacts(row: GapRow, loot: readonly LootEvent[]): ItemFacts {
  const drops = dropsSeen(row.name, loot)
  const mobs = new Set(drops.map((d) => d.mob.toLowerCase()))
  const bought = row.kinds.includes('bought')
  const soldBy = bought ? (row.details.sources?.entries ?? []).map((e) => e.name).filter((n) => !mobs.has(n.toLowerCase())) : []
  const merchantValue = derivedPrices(row.details)?.vendorValue
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

/** What the ledger looted from the mob, by item, A to Z. */
function mobLoot(row: GapRow, loot: readonly LootEvent[]): MobFacts['loot'] {
  const byItem = new Map<string, { item: string; drops: number }>()
  for (const e of loot) {
    if (e.source === undefined || !same(e.source, row.name)) continue
    const seen = byItem.get(e.item.toLowerCase()) ?? { item: e.item, drops: 0 }
    seen.drops += 1
    byItem.set(e.item.toLowerCase(), seen)
  }
  // The row's own drop list names what the ledger may not hold.
  for (const d of row.details.drops?.entries ?? []) {
    if (!byItem.has(d.name.toLowerCase())) byItem.set(d.name.toLowerCase(), { item: d.name, drops: d.n })
  }
  return [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item))
}

/** `kills` must be a `killIndex` result, as `killsFor` asks. */
export function mobFacts(row: GapRow, loot: readonly LootEvent[], kills: KillMap, seen: MobSightings = {}): MobFacts {
  const mine = (m: { mob: string }): boolean => same(m.mob, row.name)
  return {
    name: row.name,
    zones: rowZones(row),
    levels: conLevels(row),
    loot: mobLoot(row, loot),
    kills: killsFor(kills, row.name)?.count ?? 0,
    points: (seen.mobLocs ?? []).filter(mine).flatMap((m) => m.points),
    factions: (seen.killFactions ?? []).filter(mine).map((f) => ({ faction: f.faction, ...(f.adjust === undefined ? {} : { adjust: f.adjust }) }))
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
  if (kills <= 0) return `<li> {{:${item}}} </li>`
  const pct = Math.min(100, Math.round((drops / kills) * 1000) / 10)
  return `<li> {{:${item}}} <span class='drare'>(${rarityWord(pct)})</span> <span class='ddb'>[Overall: ~${String(pct)}%]</span> </li>`
}

export function itemPage(f: ItemFacts): string {
  const byZone = new Map<string, string[]>()
  for (const d of f.drops) byZone.set(d.zone, [...(byZone.get(d.zone) ?? []), d.mob])
  const fields: [string, string][] = [['itemname', f.name]]
  if (f.merchantValue !== undefined) fields.push(['merchant_value', wikiCoin(f.merchantValue)])
  fields.push(['statsblock', ''])
  if (byZone.size > 0) fields.push(['dropsfrom', zoneBlocks(byZone)])
  if (f.soldBy.length > 0) fields.push(['soldby', bulletLinks(f.soldBy)])
  const cats = [
    ...(f.soldBy.length > 0 ? ['Vendor Sold'] : []),
    ...(f.crafted ? ['Player Crafted'] : []),
    ...[...byZone.keys()].filter((z) => z !== '').sort((a, b) => a.localeCompare(b))
  ]
  return page(templateBlock('Itempage', fields), cats)
}

// ---- NPC and merchant pages: the blueprints' full layout ------------------------------------------
//
// Unlike an item page, an NPC page keeps every field of its template, filled or blank (owner,
// 2026-10-18, with a real page): the blueprint's order and its `| key<padding> = value` alignment,
// a blank line between the groups. What the log fills is filled; the rest waits for the screenshot.

/** The NPC Page Blueprint's fields; '' is a blank line between groups. */
const NPC_LAYOUT = ['imagefilename', '', 'name', 'race', 'class', 'level', 'agro_radius', 'run_speed', '', 'zone', 'location', 'respawn_time', '', 'AC', 'HP', 'HP_regen', 'mana_regen', '', 'attacks_per_round', 'attack_speed', 'damage_per_hit', 'special', '', 'description', '', 'known_loot', '', 'common_loot', '', 'factions', '', 'opposing_factions', '', 'related_quests', '']
/** The Merchant Page Blueprint's: no loot, `items_sold` instead (left for the merchant window). */
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

/** The wiki's image name for an NPC: `npc_drizda_tunesinger.png`. */
export const npcImageName = (name: string): string => `npc_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.png`

/** `/loc` points as the wiki writes `|location`: `(-791, 173), (10, -21)`. */
const locationText = (points: readonly number[][]): string => points.map((p) => `(${String(p[0])}, ${String(p[1])})`).join(', ')

/** A kill's factions as the page lists them: lowered under `factions`, raised under `opposing_factions`. */
function factionBlocks(factions: MobFacts['factions']): Record<string, string> {
  const line = (f: MobFacts['factions'][number], css: string): string =>
    `* ${wikiLink(f.faction)}${f.adjust === undefined ? '' : ` <span class='${css}'>(${String(f.adjust)})</span>`}`
  const lowered = factions.filter((f) => (f.adjust ?? -1) < 0).map((f) => line(f, 'profac'))
  const raised = factions.filter((f) => (f.adjust ?? -1) > 0).map((f) => line(f, 'oppfac'))
  return { factions: lowered.join('\n'), opposing_factions: raised.join('\n') }
}

/** The values both NPC layouts share: image, name, level, zone, location, factions. */
function npcValues(f: Pick<MobFacts, 'name' | 'zones' | 'levels' | 'points' | 'factions'>): Record<string, string> {
  const lo = f.levels[0]
  const hi = f.levels.at(-1)
  return {
    imagefilename: npcImageName(f.name),
    name: f.name,
    level: lo === undefined || hi === undefined ? '' : lo === hi ? String(lo) : `${String(lo)} - ${String(hi)}`,
    zone: f.zones.map(wikiLink).join(', '),
    location: locationText(f.points),
    ...factionBlocks(f.factions)
  }
}

export function mobPage(f: MobFacts): string {
  const loot = f.loot.length === 0 ? '' : `<ul>\n${f.loot.map((l) => lootLine(l.item, l.drops, f.kills)).join('\n')}\n</ul>`
  return page(layoutBlock('Namedmobpage', NPC_LAYOUT, { ...npcValues(f), known_loot: loot }), f.zones)
}

/** The wiki's Spell Page Blueprint layout: `{{Spellpage|`, blank lines between, `| key = value`. */
export function spellPage(f: SpellFacts): string {
  const fields = [`| spellname = ${f.name}`, ...(f.npcOnly ? ['| classes =\n\nThis spell is cast by NPCs only.'] : [])]
  const body = `{{Spellpage|\n\n${fields.join('\n\n')}\n\n}}`
  return page(`\n${body}`, f.npcOnly ? ['NPC Only Spells'] : [])
}

/**
 * A trader the wiki lacks as a merchant, in the Merchant Page Blueprint's layout. `items_sold` is
 * left open: a merchant's stock mixes player resells the log cannot tell apart (owner, 2026-10-18).
 */
export function merchantPage(f: Pick<MobFacts, 'name' | 'zones' | 'levels' | 'points' | 'factions'>): string {
  return page(layoutBlock('MerchantPage', MERCHANT_LAYOUT, { ...npcValues(f), class: '[[Merchant]]' }), f.zones)
}

/** The page for one Gaps row; a faction row gives the bullet its mob's `|factions` takes. `kills`
 *  must be a `killIndex` result. */
export function wikiPageText(row: GapRow, loot: readonly LootEvent[], kills: KillMap, seen: MobSightings = {}): string {
  if (row.domain === 'item') return itemPage(itemFacts(row, loot))
  if (row.domain === 'mob') return mobPage(mobFacts(row, loot, kills, seen))
  if (row.domain === 'merchant') return merchantPage(mobFacts(row, [], kills, seen))
  if (row.domain === 'spell') return spellPage({ name: row.name, npcOnly: npcOnlySpell(row) })
  return mobPageLine(row, kills)
}

/** A faction, image or drop row: the one line its mob's page lacks. */
function mobPageLine(row: GapRow, kills: KillMap): string {
  if (row.domain === 'faction') return `* ${wikiLink(factionOf(row))}\n`
  if (row.domain === 'image') return `| ${'imagefilename'.padEnd(17)} = ${row.image ?? ''}\n`
  // A drop: its group's link (`<li> [[Rusty Weapons]] </li>`), else the item with the rate seen.
  if (row.details.drops) return `<li> ${wikiLink(factionOf(row))} </li>\n`
  return `${lootLine(factionOf(row), row.count, killsFor(kills, factionMob(row))?.count ?? 0)}\n`
}
