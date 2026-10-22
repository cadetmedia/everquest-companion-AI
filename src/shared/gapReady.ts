// shared/gapReady.ts — whether a Gaps row is Ready (owner, 2026-10-21: "we can mark items as 'ready
// to process' or something so the user knows they have 1. screenshot of item data and/or lore 2. kill
// data, etc whatever so they know they don't have to capture more information"; "yes get the ready in
// here, and have it as a filter"). Ready = nothing left that the player can capture for the row's copy.
//
// It reads what the app already computes: `stillNeeded` (wikiPage.ts), which already counts the kept
// item and spell windows, plus the mob pictures saved from the tab. Per domain:
// - Items: the item window at +0, and the Lore tab when the window shows one. A redirect is Ready.
// - Spells: the description (the install's spell files or a pasted spell window). A redirect is Ready.
// - Mobs: a level (/con), a location, a kill of your own (factions) and a saved picture.
// - Merchants: a level, a location and a saved picture.
// - Images: the saved picture.
// - Factions: the amount (a kill that is not capped).
// - Drops and forage lines: Ready by nature; the copy is the line to add.

import type { GapRow } from './gaps'
import { pictureFile } from './mobPicture'
import { IMAGE_NEED } from './wikiPage'

/** What the player kept beyond the item and spell windows: the mob pictures saved, by file name. */
export interface KeptCaptures {
  pictures: Readonly<Record<string, unknown>>
}

/** The page fields still open for this row, in full; `needed` is its `stillNeeded`. Empty = Ready. */
export function openNeeds(row: GapRow, needed: readonly string[], kept: KeptCaptures): string[] {
  // A near miss copies as a redirect, which needs nothing from the game.
  if (row.suggest !== undefined && (row.domain === 'item' || row.domain === 'spell')) return []
  const pictured = kept.pictures[pictureFile(row)] !== undefined
  if (row.domain === 'image') return pictured ? [] : [IMAGE_NEED]
  return pictured ? needed.filter((n) => n !== IMAGE_NEED) : [...needed]
}

/** A need in a word or two, for the row: `lore (paste the Lore tab below)` is `lore`. */
const shortNeed = (need: string): string => need.replace(/\s*\(.*$/, '').replace(/^the /, '')

/** The row's hint: what is left to capture, a word each (`lore, image`); '' when Ready. */
export const needsWords = (needs: readonly string[]): string => needs.map(shortNeed).join(', ')
