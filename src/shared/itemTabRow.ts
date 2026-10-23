// itemTabRow.ts — where an item window's tab row (`Description` `Lore`) is among its OCR lines, as
// slipped as OCR reads it. Split out of itemWindow.ts (its size bar); pure.

import { editDistance } from './itemVocab'

/** The tab row reads as junk around `Description` (`| /~ SPDesciption 3, © [[ 4" “Lore`). */
const TAB_ROW = /Des\w{0,4}ption/i

/** A word OCR made of the tab label `Description`, within three letters (`Descriplic`). */
const descriptionWord = (w: string): boolean => {
  const t = w.toLowerCase().replace(/[^a-z]/g, '')
  return t.length >= 7 && editDistance(t, 'description') <= 3
}

/**
 * The window's tab row: `Description` read whole, or slipped further with `Lore` on the same line
 * (owner's Petamorph Wand: Werewolf Lore tab, 2026-10-22: `VE A Descriplic y A rr Lore | hy.`).
 */
export const isTabRow = (l: string): boolean => TAB_ROW.test(l) || (/\bLore\b/i.test(l) && l.split(/\s+/).some(descriptionWord))

/** Lines the tab row can be: under the title bar, at the top of the window. */
const TAB_ROW_TOP = 3

/**
 * Where the tab row is: a line that reads as one anywhere, else a line near the top with a slipped
 * `Description` and nothing of `Lore` left (owner's enlarged Lore tab, 2026-10-22:
 * `Wr ~~ Descriplic TRVAC) N "ra . Coe:`). -1 for none.
 */
export function tabRowAt(lines: readonly string[]): number {
  const at = lines.findIndex(isTabRow)
  if (at >= 0) return at
  return lines.slice(0, TAB_ROW_TOP).findIndex((l) => l.split(/\s+/).some(descriptionWord) || splitDescription(l))
}

/**
 * A line near the top whose letters, the spaces and marks OCR put in dropped, open with `Description`
 * within two letters (owner's Peerless Sapphire Lore tab, 2026-10-23: `D esc fp tion - ore Pp`). At the
 * line's start only, and two letters at most, so a lore line such as `Destruction ...` is never it.
 */
function splitDescription(l: string): boolean {
  // `cleanLine` drops a lone leading letter as a mark, so the `D` of `D esc fp tion` may be gone.
  const letters = l.toLowerCase().replace(/[^a-z]/g, '')
  for (let len = 8; len <= 13; len++) {
    const head = letters.slice(0, len)
    // The row ends with its other tab, `Lore` (read `ore`): a lore line opening `Inscription` does not.
    const lore = /l?ore/.test(letters.slice(len))
    if (lore && (editDistance(head, 'description') <= 2 || editDistance(head, 'escription') <= 2)) return true
  }
  return false
}
