// itemShotKeep.ts — what a paste in a Gaps item row's screenshot box keeps (owner, 2026-10-21, after
// testing: a nonsense image keeps nothing; a window whose name is another item's waits for "Use it
// anyway"; a window paste replaces every window field, a Lore paste only the lore; each part has
// its own clear). Pure, so the rules are tested apart from the panel (ShotPanel.tsx).

import { editDistance } from './itemVocab'
import { gapJob } from './gapJob'
import type { GapRow } from './gaps'
import { isTabRow, withoutTier, type ItemShotReply } from './itemWindow'
import type { ItemPageShot } from './wikiPage'

/** What one paste was: the item window, its Lore tab, the icon alone; null when nothing usable was read. */
export type ShotKind = 'window' | 'lore' | 'icon'

/**
 * An icon-only paste must fit this well to count (lower is closer). Measured 2026-10-21 on the
 * fixtures: right answers scored 146 to 437, a wrong best fit 940 to 2,000.
 */
export const ICON_FIT_MAX = 900

/** The tab word the Lore tab shows above its text (OCR may misspell `Description`, never both). */
const TAB_RE = /\bLore\b/i

/** Enough words and letters to be a sentence, not OCR noise. */
const sentence = (s: string): boolean => s.split(/\s+/).length >= 3 && (s.match(/[a-z]/gi) ?? []).length >= 12

/** Both tab words on one line: the window's tab row (`- Description Lore`), not a stray `Lore` in a picture. */
const tabRowWithLore = (l: string): boolean => isTabRow(l) && /\bLore\b/i.test(l)
/**
 * The Description tab's own text: a lore read off it is a window whose Class line OCR missed. Labels
 * with their colon: a lore's prose may say "class" (`... - Class 1`, review 2026-10-21).
 */
const WINDOW_TEXT = /\b(Equipped|No Trade|Temporary)\b|\b(Class|Race|Size|Weight)\s*[:;]/i

/**
 * A Lore tab: its text under the tab row. A short lore counts when the tab row was read (owner,
 * 2026-10-21: Shrubbery's `Ordinary Plant` was refused by the sentence rule); without the row, a
 * sentence and the tab word, as before.
 */
function isLore(r: ItemShotReply): boolean {
  const lore = r.read.lore
  if (lore === undefined || WINDOW_TEXT.test(lore) || !/[a-z]{3}/i.test(lore)) return false
  return r.lines.some(tabRowWithLore) || (sentence(lore) && r.lines.some((l) => TAB_RE.test(l)))
}

/** A window's statsblock carries its Class or Race codes; a blank one (a Lore tab taken for a window) does not. */
const WINDOW_BLOCK = /^(?:Class|Race): \S/m

export function shotKind(r: ItemShotReply): ShotKind | null {
  if (r.error !== undefined) return null
  if (WINDOW_BLOCK.test(r.read.statsblock)) return 'window'
  if (isLore(r)) return 'lore'
  const best = r.icons[0]
  if (r.lines.length === 0 && best !== undefined && best.score <= ICON_FIT_MAX) return 'icon'
  return null
}

/** Letters and digits only, case ignored, a `+N` tier dropped. */
const squash = (s: string): string => withoutTier(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const digits = (s: string): string => s.replace(/\D/g, '')

/**
 * Whether the window's name is the row's item: letters and digits only, case ignored, two slips
 * allowed (OCR ran `Black Lizard Scale` together; a title read `Windstiker`; owner's ruling). No name
 * read: true. A slip is not taken when the digits differ (`Froggotten Page 2` / `3`) or when another
 * known name (`others`: the catalog's items near it, the other Gaps rows) is as near, since then it
 * may be that item (`Cloth Cape` on the `Cloth Cap` row; review, 2026-10-21).
 */
export function sameItem(read: string | undefined, row: string, others: readonly string[] = []): boolean {
  if (read === undefined) return true
  const [a, b] = [squash(read), squash(row)]
  if (a === b) return true
  const d = editDistance(a, b)
  if (d > 2 || digits(a) !== digits(b)) return false
  return !others.some((o) => squash(o) !== b && editDistance(a, squash(o)) <= d)
}

/** The names within OCR's two slips of `name`: what `sameItem` checks a slip against (main, over the item catalog). */
export function nearNames(name: string, names: readonly string[]): string[] {
  const a = squash(name)
  return names.filter((n) => {
    const b = squash(n)
    return Math.abs(a.length - b.length) <= 2 && editDistance(a, b) <= 2
  })
}

/**
 * Why a paste waits for the player before anything is kept, in words; undefined when it is the row's
 * own. Another item's window or Lore tab, and a window or Lore tab whose name was not read (a snip
 * below the title kept Mud Stained Skin Tunic's facts on Gray Wolf Skull, owner, 2026-10-21). An
 * icon alone names nothing and is not asked about. `what`: the part, as the player calls it;
 * `others`: the known names a slip could also be (`sameItem`).
 */
export function otherItemNote(read: string | undefined, row: string, what: string, others: readonly string[] = []): string | undefined {
  if (read === undefined) return `No name was found in this ${what}: is it ${row}'s?`
  if (sameItem(read, row, others)) return undefined
  return sameItem(read, row) ? `This ${what} reads "${read}": is it ${row}'s?` : `This is ${read}'s ${what}, not ${row}'s.`
}

/** The part a kind of paste is, in the player's words. */
export const PART_WORDS: Record<ShotKind, string> = { window: 'item window', lore: 'Lore tab', icon: 'icon' }

/** The first line that reads as words, for telling the player what was read. */
const firstWords = (lines: readonly string[]): string | undefined => lines.map((l) => l.trim()).find((l) => /[A-Za-z]{3}.*[A-Za-z]{3}/.test(l))

/**
 * Why a paste kept nothing (shotKind null), in plain words, with what to do (owner, 2026-10-21: "just
 * says error without a reason, sort of useless for me").
 */
export function shotProblem(r: ItemShotReply): string {
  if (r.error !== undefined) return `${r.error} Paste a screenshot (PNG or JPEG) of the item window.`
  const best = r.icons[0]
  if (r.lines.length === 0 && best !== undefined) return `It looks like an icon alone, but no game icon matches it closely (the nearest is ${String(best.id)}). Snip the whole item window instead.`
  const words = firstWords(r.lines)
  if (words === undefined) return 'No text was found in this picture. Snip the item window (Win+Shift+S) and paste it again.'
  return `Text was read ("${words.length > 40 ? `${words.slice(0, 40)}…` : words}"), but no item window (no Class, Race, Slot or Weight line) and no Lore tab. Snip the whole window, the tab row included.`
}

/** The window's own fields: everything but the lore. */
export function hasWindowPart(s: ItemPageShot | undefined): boolean {
  return s !== undefined && (s.statsblock !== undefined || s.iconId !== undefined || s.valueCopper !== undefined || s.focusEffect !== undefined)
}

const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

/** What is kept after this paste: a window replaces every window field (the lore stays); a Lore tab only the lore; an icon only the icon. */
export function keptAfter(kept: ItemPageShot | undefined, r: ItemShotReply, kind: ShotKind): ItemPageShot {
  if (kind === 'lore') return { ...kept, lore: r.read.lore }
  if (kind === 'icon') return { ...kept, iconId: r.icons[0]?.id }
  return defined({ lore: kept?.lore, statsblock: r.read.statsblock, iconId: r.icons[0]?.id, valueCopper: r.read.valueCopper, focusEffect: r.read.focusEffect, loreTab: r.read.loreTab, tier: r.read.tier, baseStatsblock: r.read.baseStatsblock })
}

/** One part cleared; null when nothing is left to keep. */
export function cleared(kept: ItemPageShot, part: 'window' | 'lore'): ItemPageShot | null {
  const next: ItemPageShot = part === 'lore' ? defined({ ...kept, lore: undefined }) : defined({ lore: kept.lore })
  return Object.keys(next).length === 0 ? null : next
}

/**
 * A Gaps row that takes an item screenshot: an Items row for a new page. An update row (a known
 * item's page that lacks a forage zone, gapJob.ts) copies no reading, so it has no paste box and no
 * capture is filed on it.
 */
export const isItemShotRow = (r: GapRow): boolean => r.domain === 'item' && r.suggest === undefined && gapJob(r) !== 'update'

/** The Gaps item rows' names: where a capture from the game can be filed. */
export const itemRowNames = (rows: readonly GapRow[]): string[] => rows.filter(isItemShotRow).map((r) => r.name)

/** Where a capture goes: the row, and whether the name read is the row's exactly (else it waits for the player). */
export interface CaptureMatch {
  row: string
  exact: boolean
}

/**
 * The row a capture from the game belongs to (phase 3): the row named exactly so (case, spaces and
 * marks aside), filed at once; else the one row the window's name matches through OCR's slips
 * (`sameItem`, against the other rows and `known`, the catalog's names near it), which waits for the
 * player; none when no row or several match.
 */
export function captureRow(name: string | undefined, rowNames: readonly string[], known: readonly string[] = []): CaptureMatch | undefined {
  if (name === undefined) return undefined
  const exact = rowNames.find((r) => squash(r) === squash(name))
  if (exact !== undefined) return { row: exact, exact: true }
  const others = [...known, ...rowNames]
  const near = rowNames.filter((r) => sameItem(name, r, others))
  return near.length === 1 ? { row: near[0], exact: false } : undefined
}

/** The lines read but not placed, less OCR junk of under four letters (`EEE`; owner, 2026-10-21). */
export const unplaced = (r: ItemShotReply): string[] => r.read.unread.filter((u) => (u.match(/[a-z]/gi) ?? []).length >= 4)
