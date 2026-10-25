// gapUnknownItems.ts — which item names the wiki data has no page for, for the Gaps rows of items
// no log line names: an item in the player's inventory export, and an item window a capture read
// (owner, 2026-10-22: Petamorph Wand: Gelatinous Cube, a store purchase with no log line).
//
// THE ENGINE'S CHECK, RESTATED: the gaps module decides a looted name with gaps_keys.rs
// (`ItemIndex::known`): the ` (Exaltation)` / ` from Reward Chest` suffixes and ` +N` off, case and
// the three quote marks folded, then the loose fold (apostrophes dropped, `- , .` read as spaces,
// ` vs ` as ` versus `), then the same without a leading article; a `Spell: X` / `Song: X` scroll is
// known when its spell is. The keys are items.json's own plus each record's `otherNames` (the wiki
// redirects, itemOtherNames.ts). The engine reads no inventory export, so main answers here, read
// off the corpus already in this bundle; never fetched.
//
// ELECTRON-FREE, as gapItemMobs.ts is: tests/gapExtraItems.test.mts drives `unknownOf`.

import { itemBaseName } from '../shared/itemStats'
import itemsJson from './data/items.json'
import spellsJson from './data/spells.json'
import { applySpellRemovals } from './data/spellRemovals'
import { itemsByAnyName } from './itemOtherNames'
import type { ItemDbFile } from './itemsDb'
import type { SpellDbFile } from '../shared/types'

const foldQuotes = (s: string): string => s.replace(/[`’´]/g, "'")

/**
 * gaps_keys.rs `item_gap_key`: suffixes and ` +N` off, lowercased, quotes folded. An export also
 * spells a worn item's ornament socket `<Item> (Ornamentation)` (`Head-Slot2`, as `(Exaltation)` sits
 * in `-Slot7`): the item's own appearance, the same page (the owner's export: seven Rubicite pieces).
 */
export function itemGapKey(name: string): string {
  const base = name.trim().replace(/ \((?:Exaltation|Ornamentation)\)$/, '').replace(/ from Reward Chest$/, '')
  return foldQuotes(itemBaseName(base).toLowerCase())
}

/** gaps_keys.rs `loose_key`. */
export function looseKey(key: string): string {
  const spaced = key.replace(/'/g, '').replace(/[-,.]/g, ' ')
  return ` ${spaced.split(/\s+/).filter(Boolean).join(' ')} `.replace(/ vs /g, ' versus ').trim()
}

const bare = (k: string): string | undefined => ['a ', 'an ', 'the '].map((a) => (k.startsWith(a) ? k.slice(a.length) : undefined)).find((x) => x !== undefined)

/** The spell a scroll's item name carries: `Spell: X` / `Song: X` -> `X`. */
const scrollSpell = (name: string): string | undefined => /^(?:Spell|Song): (.+)$/.exec(name.trim())?.[1]?.trim()

/** What the names are checked against, built once per corpus. */
export interface KnownIndex {
  exact: ReadonlySet<string>
  loose: ReadonlySet<string>
  spells: ReadonlySet<string>
}

export function knownIndex(itemKeys: Iterable<string>, spellNames: Iterable<string>): KnownIndex {
  const exact = new Set([...itemKeys].map(itemGapKey))
  const loose = new Set([...exact].flatMap((k) => [looseKey(k), bare(looseKey(k)) ?? looseKey(k)]))
  return { exact, loose, spells: new Set([...spellNames].map((n) => looseKey(foldQuotes(n.toLowerCase())))) }
}

/** Is the name an item the wiki data knows, as the engine would decide it? */
export function knownItem(name: string, index: KnownIndex): boolean {
  const key = itemGapKey(name)
  if (index.exact.has(key) || index.loose.has(looseKey(key))) return true
  const spell = scrollSpell(name)
  return spell !== undefined && index.spells.has(looseKey(foldQuotes(spell.toLowerCase())))
}

/** The names the wiki data has no page for, each once, in the order given. */
export function unknownOf(names: readonly string[], index: KnownIndex): string[] {
  return [...new Set(names.map((n) => n.trim()).filter((n) => /[A-Za-z]{2}/.test(n)))].filter((n) => !knownItem(n, index))
}

let index: KnownIndex | null = null

/** Each spell's page name and the names its redirects give it (`Familiar: Werewolf` -> Summon Familiar: Werewolf). */
const spellNames = (): string[] =>
  applySpellRemovals((spellsJson as SpellDbFile).spells).spells.flatMap((s) => [s.name, ...((s as { otherNames?: string[] }).otherNames ?? [])])

/** `unknownOf` over the corpus in this bundle (items.json with its redirect names, spells.json). */
export function unknownItems(names: readonly string[]): string[] {
  index ??= knownIndex(
    Object.keys(itemsByAnyName((itemsJson as unknown as ItemDbFile).items)),
    // Through the removals seam: a scroll of a spell EQ Legends does not have is no known item.
    spellNames()
  )
  return unknownOf(names, index)
}

/**
 * A spell key with the letter shapes the reader confuses in the game's small window font folded
 * together, the same on both sides (owner, 2026-10-24: the window's `Supernova` read `Supemova`):
 * `rn` as `m`, `cl` as `d`, `vv` as `w`, `1` `i` `|` as `l`, `0` as `o`. Only shapes, never a letter
 * dropped or added, so `Rune II` and `Rune III` stay two spells.
 */
export const ocrShape = (key: string): string => key.replace(/rn/g, 'm').replace(/cl/g, 'd').replace(/vv/g, 'w').replace(/[1i|]/g, 'l').replace(/0/g, 'o')

let spellShapes: ReadonlySet<string> | null = null

/**
 * The spell names the wiki data has no page for, each once (owner, 2026-10-23: a pasted Pet Illusion:
 * Gelatinous Cube window made no row). A name that is a known spell misread (`ocrShape`) is known: it
 * has its page, so it makes no row.
 */
export function unknownSpells(names: readonly string[]): string[] {
  index ??= knownIndex(Object.keys(itemsByAnyName((itemsJson as unknown as ItemDbFile).items)), spellNames())
  const known = index.spells
  const shapes = (spellShapes ??= new Set([...known].map(ocrShape)))
  return [...new Set(names.map((n) => n.trim()).filter((n) => /[A-Za-z]{2}/.test(n)))].filter((n) => {
    const key = looseKey(foldQuotes(n.toLowerCase()))
    return !known.has(key) && !shapes.has(ocrShape(key))
  })
}
