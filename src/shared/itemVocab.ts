// itemVocab.ts — the values an item page's statsblock holds, spelled as the wiki writes them, for the
// screenshot reader (itemWindow.ts). Owner rulings, 2026-10-21:
//   D1 "Follow the wiki norm you found": the flag line in the window's own Title Case, joined by
//      ", " (`No Trade, Quest`); Size before WT; values in caps (sizes, slots, class and race codes,
//      ALL, NONE), `except` in lower case; slots singular (EAR, WRIST, FINGER) but SHOULDERS; Deity in
//      full Title Case names (`Cazic-Thule`, `The Tribunal`).
//   "The known-values list is a GUIDE, not a law" ("new classes are being introduced soon"): a value
//      outside a set is kept as read and flagged, never refused, never forced. OCR's reading snaps to
//      a known value only within edit distance 1 of exactly one (2 for 8+ letters), and says so.
// Measured on the 11,594 cached item pages (2026-10-21): recent edits write Title flags (532 lines
// since 09-28 against 15 in caps) and Size before WT (468 against 17 in October); values stay caps on
// those pages (Size 1,140 of 1,145). Built from the tables the planner already keeps (classCombo.ts
// CLASS_ABBRS, planner/types.ts EQUIP_SLOTS, normalize.ts SLOT_RENAMES).

import { CLASS_ABBRS } from './classCombo'
import { EQUIP_SLOTS } from './planner/types'

/** The flags as the window prints them (eqstr_us.txt: `Lore`, `No Trade`, `Temporary`, `Artifact` ...). */
export const FLAG_WORDS: readonly string[] = [
  'Magic', 'Lore Equipped', 'Lore', 'Pending Lore', 'No Trade', 'Temporary', 'Quest', 'No Storage', 'Attunable', 'Expendable',
  'Placeable', 'Heirloom', 'Artifact', 'Augmentation', 'No Pet', 'No Destroy'
]
export const SIZES: readonly string[] = ['TINY', 'SMALL', 'MEDIUM', 'LARGE', 'GIANT']
/** The wiki's slots: the planner's equip slots plus the two the planner does not rank. */
export const SLOTS: readonly string[] = [...EQUIP_SLOTS, 'CHARM', 'POWER SOURCE']
/** The window's word -> the wiki's (`Fingers` in eqstr_us.txt 571; the pages write FINGER 218 times, FINGERS 5). */
export const SLOT_RENAMES: Readonly<Record<string, string>> = { EARS: 'EAR', WRISTS: 'WRIST', FINGERS: 'FINGER', SHOULDER: 'SHOULDERS' }
export const CLASS_CODES: readonly string[] = CLASS_ABBRS
/** The client's race codes (eqstr_us.txt 3050-3063), Froglok and Drakkin after them. */
export const RACE_CODES: readonly string[] = ['HUM', 'BAR', 'ERU', 'ELF', 'HIE', 'DEF', 'HEF', 'DWF', 'TRL', 'OGR', 'HFL', 'GNM', 'IKS', 'VAH', 'FRG', 'DRK']
/** The class or race line's words besides the codes; `except` is lower case on the pages (716). */
const LIST_WORDS: Readonly<Record<string, string>> = { ALL: 'ALL', NONE: 'NONE', EXCEPT: 'except' }
/** The gods as the pages spell them (439 Deity lines). */
export const DEITIES: readonly string[] = [
  'Agnostic', 'Bertoxxulous', 'Brell Serilis', 'Bristlebane', 'Cazic-Thule', 'Erollisi Marr', 'Innoruuk', 'Karana', 'Mithaniel Marr',
  'Prexus', 'Quellious', 'Rallos Zek', 'Rodcet Nife', 'Solusek Ro', 'The Tribunal', 'Tunare', 'Veeshan'
]

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

export interface Snapped {
  value: string
  /** Why the value is not exactly what was read, or why it should be looked at. */
  note?: string
}

const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * One read token against a known set: the set's spelling when it is the same word (case and
 * punctuation aside); the one known value within OCR's reach (edit distance 1, 2 for 8+ letters),
 * noted; else the token as read, noted for a look (a new class, a new flag).
 */
export function snap(read: string, known: readonly string[], what: string): Snapped {
  const f = fold(read)
  const exact = known.find((k) => fold(k) === f)
  if (exact !== undefined) return { value: exact }
  const reach = f.length >= 8 ? 2 : 1
  const near = known.filter((k) => editDistance(fold(k), f) <= reach)
  if (near.length === 1) return { value: near[0], note: `${what} read as "${read}", taken as ${near[0]}.` }
  return { value: read, note: `${what} "${read}" is not one the wiki uses: kept as read, check it.` }
}

/** A slot word as the wiki writes it: the planner's renames first. */
export function slotWord(read: string): Snapped {
  const up = read.toUpperCase()
  return SLOT_RENAMES[up] !== undefined ? { value: SLOT_RENAMES[up] } : snap(read, SLOTS, 'Slot')
}

/** The `Class:` or `Race:` line's words: codes, ALL, NONE, `except`. */
export function codeWords(words: readonly string[], codes: readonly string[], what: string): { value: string; notes: string[] } {
  const notes: string[] = []
  const out = words.map((w) => {
    const list = LIST_WORDS[w.toUpperCase()]
    if (list !== undefined) return list
    const s = snap(w, codes, what)
    if (s.note !== undefined) notes.push(s.note)
    return s.value === w ? w.toUpperCase() : s.value
  })
  return { value: out.join(' '), notes }
}

const DEITY_RE = new RegExp(`\\b(${DEITIES.map((d) => d.replace(/[- ]/g, '[-\\s]?')).join('|')})\\b`, 'gi')

/** A line that is gods' names and nothing else: the window prints the deity without a label. */
export function isDeityLine(line: string): boolean {
  DEITY_RE.lastIndex = 0
  return DEITY_RE.test(line) && deityText(line).note === undefined
}

/** `Deity:` text with every god in the pages' spelling (`Cazic Thule` -> `Cazic-Thule`); a leftover word is flagged. */
export function deityText(read: string): Snapped {
  const value = read.replace(DEITY_RE, (m) => DEITIES.find((d) => fold(d) === fold(m)) ?? m)
  const left = value.replace(DEITY_RE, '').replace(/[\s,/&]+|\band\b/gi, '')
  return left === '' ? { value } : { value, note: `Deity "${read}" names a god the wiki does not list: kept as read, check it.` }
}
