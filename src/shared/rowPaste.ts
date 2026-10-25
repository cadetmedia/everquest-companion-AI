// rowPaste.ts — a picture pasted into one Gaps row's box that is another kind of window (owner,
// 2026-10-25: "lets make this thing smart so whatever we paste it can scrape the data into the
// appropriate area"). Each row's box reads one kind: an Items row the item window and its Lore tab, a
// Spells row the spell display window, a Mobs / Merchants / Images row a picture of the mob, a Quests
// row the Quest Journal and popups. What a picture is comes from the plain OCR lines the box has read
// already (pasteRoute.ts `pictureKind`, a popup by its closing line, a mob by its nameplate), so telling
// costs no second read. A window of another kind is never written into this row's page: the player is
// told what it is and offered the row that takes it, by name, else the reader that keeps it
// (features/gaps/Misfit.tsx). Pure.

import { captureRow, iconFree } from './itemShotKeep'
import { readItemWindow } from './itemWindow'
import { CLOSING, nameplateRow, pictureKind } from './pasteRoute'
import { readSpellWindow } from './spellWindow'

/** The kind of row a paste box sits on. */
export type RowBox = 'item' | 'spell' | 'mob' | 'quest'

/** What a pasted picture plainly is: a window of some kind, or a picture of a mob a row names. */
export type Pasted = 'item' | 'spell' | 'journal' | 'popup' | 'mob'

/**
 * What a picture is from its plain OCR lines: a Quest Journal, a spell display window, an item window
 * or its Lore tab, a popup (only by its closing line, `Click 'OK' to continue.`: two lines of prose
 * are also a chat window behind a mob), else other.
 */
export function pastedKind(lines: readonly string[]): Exclude<Pasted, 'mob'> | 'other' {
  const kind = pictureKind(lines, null)
  if (kind !== 'other') return kind
  return lines.some((l) => CLOSING.test(l)) ? 'popup' : 'other'
}

/** The rows a misplaced picture can go to, by kind. */
export interface PasteRows {
  items: readonly string[]
  spells: readonly string[]
  /** Mobs, Merchants and Images rows, with the file their picture is saved as. */
  pictures: readonly { name: string; file: string }[]
  /** The item catalog's names near the one read, which a slip could also be (itemShotKeep.ts `sameItem`). */
  known?: readonly string[]
}

/** The row the paste was made on. */
export interface PasteHere {
  box: RowBox
  row: string
}

/** A picture of another kind than its box reads: what it is, the row that takes it, what to say and offer. */
export interface Misfit {
  kind: Pasted
  /** The name the window (or nameplate) shows, when it was read. */
  name?: string
  /** The Gaps row that takes it, by name; for a mob picture, the file it is saved as too. */
  row?: string
  file?: string
  /** The note, in plain words. */
  text: string
  /** The button that sends it where it belongs. */
  action: string
}

/** The kinds each box reads itself. */
const READS: Record<RowBox, readonly Pasted[]> = { item: ['item'], spell: ['spell'], mob: [], quest: ['journal', 'popup'] }

/** Whether a box reads this kind itself. */
export const boxReads = (box: RowBox, kind: Pasted): boolean => READS[box].includes(kind)

const WHAT: Record<Pasted, string> = { item: 'an item window', spell: 'a spell display window', journal: 'a Quest Journal', popup: 'a popup window', mob: 'a picture of' }

const wants = (h: PasteHere): string =>
  ({ item: 'an item window or its Lore tab', spell: 'a spell display window', mob: `a picture of ${h.row}`, quest: 'a Quest Journal or a popup window' })[h.box]

/** The window's own name, as its reader takes it. */
function nameOf(kind: Pasted, lines: readonly string[]): string | undefined {
  if (kind === 'item') {
    const name = readItemWindow(lines).name
    return name === undefined ? undefined : iconFree(name)
  }
  return kind === 'spell' ? readSpellWindow(lines).name : undefined
}

/** The row of `kind` named `name`, through OCR's slips (one row only); undefined when none. */
function rowFor(kind: Pasted, name: string | undefined, rows: PasteRows): string | undefined {
  if (kind === 'item') return captureRow(name, rows.items, rows.known)?.row
  return kind === 'spell' ? captureRow(name, rows.spells)?.row : undefined
}

/** Where it goes, in a sentence, and the button's words. */
function whereTo(kind: Pasted, name: string | undefined, row: string | undefined): { where: string; action: string } {
  const domain = kind === 'item' ? 'Items' : 'Spells'
  if (kind === 'journal') return { where: 'A Quest Journal is kept on each quest it lists.', action: 'Read it as a Quest Journal' }
  if (kind === 'popup') return { where: 'A popup goes to the quest it names.', action: 'Send it to its quest' }
  if (row !== undefined) return { where: `It belongs on the ${domain} row ${row}.`, action: `Keep it on ${row}` }
  const none = name === undefined ? `Its name was not read, so no ${domain} row was found.` : `No ${domain} row is named ${name}.`
  return { where: none, action: `Read it as ${WHAT[kind]}` }
}

/**
 * A picture pasted on `here` that is another kind of window, or a picture of another row's mob: what
 * to tell the player and offer. Undefined when it is the box's own kind or plainly nothing known (the
 * box's own reader then says why it read nothing).
 */
export function misfitOf(lines: readonly string[], here: PasteHere, rows: PasteRows): Misfit | undefined {
  const kind = pastedKind(lines)
  if (kind === 'other') return here.box === 'mob' ? undefined : mobMisfit(lines, here, rows)
  if (boxReads(here.box, kind)) return undefined
  const name = nameOf(kind, lines)
  const row = rowFor(kind, name, rows)
  const { where, action } = whereTo(kind, name, row)
  const kept = here.box === 'mob' ? 'it was not saved' : `nothing was kept on ${here.row}`
  const text = `This is ${WHAT[kind]}${name === undefined ? '' : ` (${name})`}, not ${wants(here)}: ${kept}. ${where}`
  return { kind, ...(name === undefined ? {} : { name }), ...(row === undefined ? {} : { row }), text, action }
}

/** A picture whose plain read names another row's mob (a nameplate): that row's picture. */
function mobMisfit(lines: readonly string[], here: PasteHere, rows: PasteRows): Misfit | undefined {
  const name = nameplateRow(lines, rows.pictures.map((p) => p.name))
  const pic = rows.pictures.find((p) => p.name === name)
  if (pic === undefined || pic.name === here.row) return undefined
  const text = `This looks like a picture of ${pic.name}, not ${wants(here)}: nothing was kept on ${here.row}. It belongs on the row ${pic.name}, saved as ${pic.file}.`
  return { kind: 'mob', name: pic.name, row: pic.name, file: pic.file, text, action: `Save it as ${pic.file}` }
}
