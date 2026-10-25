// itemPageShot.ts — what a screenshot of an item's window gives its page: the fields in the page's order
// and the price as the wiki writes it. Split out of wikiPage.ts (its size bar), which re-exports these. Pure.

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

/**
 * The statsblock's empty lines to type into, when no screenshot has been taken of the item's window
 * (owner, 2026-10-20: "items need the WT stat so i can fill it in", "use the template data"). Read from
 * https://eqlwiki.com/Help:Contents#Item_Page_Blueprint on 2026-10-20: `Size: ... WT: 0.0<br>`,
 * `Class: ...<br>`, `Race: ALL<br>`, in that order. Only these: the owner ruled (2026-10-18) that a page
 * carries no blueprint option lists; a flags line (`Quest<br>`) and gear lines (Slot, AC, stats) go above
 * them when the item has them.
 */
export const STATS_SKELETON = '\nSize:   WT: <br>\nClass: <br>\nRace: <br>'

/**
 * What a screenshot of the item's window gave, as the player kept it (shared/itemWindow.ts; owner ask,
 * 2026-10-21). Field order follows the page the owner wrote for Ruined Robe: itemname, lucy_img_ID,
 * notes, statsblock. The window's Value line is the game's own number, so it wins over the estimate.
 */
export interface ItemPageShot {
  /** The icon match's choices, best first, kept so the picker offers them after a restart (owner, 2026-10-24). */
  iconChoices?: number[]
  /** The window's reading checks (a number not read as one, a flag snapped), kept with it so they stay on the row (owner, 2026-10-24). */
  checks?: string[]
  statsblock?: string
  iconId?: number
  focusEffect?: string
  valueCopper?: number
  lore?: string
  /** The window showed a Lore tab: the item has lore, so a page without it says `{{Item Lore Missing}}`. */
  loreTab?: boolean
  /** A `+N` window: `statsblock` is that tier's numbers, so the page keeps the skeleton until the player takes it to +0 (D3). */
  tier?: number
  /** The upgrade rule's +0 guess for `statsblock`, offered to the player (shared/itemDelevel.ts). */
  baseStatsblock?: string
}

/** A +0 window's statsblock is the page's; never a +N number as a base one (owner, 2026-10-21, D3). */
export const baseStatsblock = (shot: ItemPageShot): string | undefined =>
  (shot.tier ?? 0) === 0 && shot.statsblock !== undefined && shot.statsblock !== '' ? shot.statsblock : undefined

/** The fields a screenshot fills, in the page's order, around the log's merchant_value. */
export function shotFields(shot: ItemPageShot, merchantValue: number | undefined): [string, string][] {
  const value = shot.valueCopper ?? merchantValue
  const fields: [string, string][] = []
  if (shot.iconId !== undefined) fields.push(['lucy_img_ID', String(shot.iconId)])
  if (value !== undefined) fields.push(['merchant_value', wikiCoin(value)])
  // The wiki's own marker for lore not yet transcribed (466 pages), so the page is listed with them.
  if (shot.lore) fields.push(['notes', `{{Item Lore|${shot.lore}}}`])
  else if (shot.loreTab === true) fields.push(['notes', '{{Item Lore Missing}}'])
  fields.push(['statsblock', baseStatsblock(shot) ?? STATS_SKELETON])
  if (shot.focusEffect) fields.push(['focus_effect', shot.focusEffect])
  return fields
}
