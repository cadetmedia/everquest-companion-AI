// gapItemForage.ts — what each foraged item's own wiki page states of foraging, for the Gaps tab's
// forage rows (owner, 2026-10-21; shared/gapForage.ts). Read off the committed corpus, the same
// module instance itemLookup.ts imports; never fetched.
//
// ELECTRON-FREE, as gapItemMobs.ts is: tests/gapForage.test.mts drives it under the node runner.

import { itemKey, type ItemDbEntry, type ItemDbFile } from './itemsDb'
import type { ItemPageForage } from '../shared/gapForage'
import itemsJson from './data/items.json'
import { itemsByAnyName } from './itemOtherNames'

/** A record's forage fields (wiki-scraper-fixes' parser); absent on a corpus parsed before them. */
type ForageEntry = ItemDbEntry & { foraged?: string[]; foragedNote?: string; foragedCategory?: boolean }

// By any name the wiki gives the page: a redirect to it finds it (itemOtherNames.ts).
const items = itemsByAnyName((itemsJson as unknown as ItemDbFile).items as Record<string, ForageEntry>)

/** One record → what its page states; the page title is the edit link's. */
export function pageForage(entry: ForageEntry): ItemPageForage {
  const note = entry.foragedNote === undefined ? {} : { note: entry.foragedNote }
  return { page: entry.page, zones: entry.foraged ?? [], ...note, category: entry.foragedCategory === true }
}

/** Each name's page forage statement; null when the corpus has no page for it. */
export function itemPageForage(names: readonly string[], corpus: Readonly<Record<string, ForageEntry>> = items): Record<string, ItemPageForage | null> {
  const out: Record<string, ItemPageForage | null> = {}
  for (const name of names) {
    const entry = corpus[itemKey(name)]
    out[name] = entry === undefined ? null : pageForage(entry)
  }
  return out
}
