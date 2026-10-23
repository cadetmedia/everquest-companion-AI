// gapItemTrades.ts — the tradeskills each item is used in, by its wiki page's recipes, for a new
// merchant page's description (owner, 2026-10-23: "why don't the vendors have descriptions ... 2.
// items sold could tell us the type of merchant so description"). The corpus is main-only, so the
// renderer asks here (shared/gapMerchantDescription.ts reads the answer).
//
// A recipe use names its tradeskill two ways (measured on items.json, 2026-10-23): a grouped line's
// `tradeskill` (`Baking`, 1,181 items carry recipes) or a link to the skill's own page
// (`{ recipe: 'Alchemy', page: 'Skill Alchemy' }`). Either is the item's trade, as the wiki spells it.
//
// ELECTRON-FREE, the gapItemMobs.ts precedent: tests drive it under the node runner.

import { itemKey, type ItemDbFile } from './itemsDb'
import itemsJson from './data/items.json'
import { itemsByAnyName } from './itemOtherNames'
import type { ItemRecipeUse } from '../shared/types'

const items = itemsByAnyName((itemsJson as unknown as ItemDbFile).items)

/** A recipe use's tradeskill: its group's, else the skill page it links (`Skill Alchemy` → `Alchemy`). */
const tradeOf = (r: ItemRecipeUse): string | undefined => r.tradeskill ?? (r.page?.startsWith('Skill ') === true ? r.page.slice('Skill '.length) : undefined)

/** Each name's tradeskills as the wiki spells them, deduped; [] for an item the corpus has none for. */
export function itemTrades(names: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const name of names) {
    const uses = items[itemKey(name)]?.recipes ?? []
    out[name] = [...new Set(uses.map(tradeOf).filter((t): t is string => t !== undefined && t !== ''))]
  }
  return out
}
