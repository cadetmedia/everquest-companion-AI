// gapItemMobs.ts — the mobs each item page's own `|dropsfrom` names, for the Gaps tab's Drops
// domain (owner ask, 2026-10-18). The wiki ties a drop to a mob twice, by hand, on two pages: the
// mob page's `|known_loot` (mobs.json, in the renderer) and the item page's `|dropsfrom` (this
// corpus, main-only). Drops reads both, so a row can say which page lacks it. Read off the
// committed corpus, the same module instance itemLookup.ts imports; never fetched.
//
// ELECTRON-FREE, the mobDropEra.ts precedent: tests/gapDrops.test.mts drives it under the node runner.

import { itemKey, type ItemDbFile } from './itemsDb'
import type { ItemPageMobs } from '../shared/gaps'
import itemsJson from './data/items.json'

const items = (itemsJson as unknown as ItemDbFile).items

/** Each name's item page mobs, page order, deduped; null when the corpus has no page for it. */
export function itemPageMobs(names: readonly string[]): ItemPageMobs {
  const out: ItemPageMobs = {}
  for (const name of names) {
    const entry = items[itemKey(name)]
    out[name] = entry === undefined ? null : [...new Set((entry.dropsFrom ?? []).map((d) => d.mob))]
  }
  return out
}
