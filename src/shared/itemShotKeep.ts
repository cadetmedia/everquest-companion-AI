// itemShotKeep.ts — what a paste in a Gaps item row's screenshot box keeps (owner, 2026-10-21, after
// testing: a nonsense image keeps nothing; a window whose name is another item's waits for "Use it
// anyway"; a window paste replaces every window field, a Lore paste only the lore; each part has
// its own clear). Pure, so the rules are tested apart from the panel (ShotPanel.tsx).

import type { ItemShotReply } from './itemWindow'
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
const TAB_ROW_RE = /Des\w{0,4}ption.*\bLore\b/i
/** The Description tab's own text: a lore read off it is a window whose Class line OCR missed. */
const WINDOW_TEXT = /\b(Equipped|No Trade|Temporary|Class|Race|Size|Weight)\b/i

/**
 * A Lore tab: its text under the tab row. A short lore counts when the tab row was read (owner,
 * 2026-10-21: Shrubbery's `Ordinary Plant` was refused by the sentence rule); without the row, a
 * sentence and the tab word, as before.
 */
function isLore(r: ItemShotReply): boolean {
  const lore = r.read.lore
  if (lore === undefined || WINDOW_TEXT.test(lore) || !/[a-z]{3}/i.test(lore)) return false
  return r.lines.some((l) => TAB_ROW_RE.test(l)) || (sentence(lore) && r.lines.some((l) => TAB_RE.test(l)))
}

export function shotKind(r: ItemShotReply): ShotKind | null {
  if (r.error !== undefined) return null
  if (r.read.statsblock !== '') return 'window'
  if (isLore(r)) return 'lore'
  const best = r.icons[0]
  if (r.lines.length === 0 && best !== undefined && best.score <= ICON_FIT_MAX) return 'icon'
  return null
}

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/**
 * Whether the window's name is the row's item: letters and digits only, case ignored, two slips
 * allowed (OCR ran `Black Lizard Scale` together; a title read `Windstiker`). No name read: true.
 */
export function sameItem(read: string | undefined, row: string): boolean {
  if (read === undefined) return true
  return editDistance(squash(read), squash(row)) <= 2
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
  return defined({ lore: kept?.lore, statsblock: r.read.statsblock, iconId: r.icons[0]?.id, valueCopper: r.read.valueCopper, focusEffect: r.read.focusEffect, loreTab: r.read.loreTab })
}

/** One part cleared; null when nothing is left to keep. */
export function cleared(kept: ItemPageShot, part: 'window' | 'lore'): ItemPageShot | null {
  const next: ItemPageShot = part === 'lore' ? defined({ ...kept, lore: undefined }) : defined({ lore: kept.lore })
  return Object.keys(next).length === 0 ? null : next
}
