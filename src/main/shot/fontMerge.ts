// fontMerge.ts — the font reader first, OCR for what it cannot read (owner, 2026-10-21: "sure do it";
// requirement: the exact reader the fast path, tesseract the fallback). OCR's lines keep their shape
// and boxes (the icon is placed from them, readItemShot.ts); a cell the game's font matched exactly
// replaces the OCR words under it. Everything else (the title bar's own font, art, a UI scale the
// font does not fit, another skin's font) stays as OCR read it. No line is added where OCR read none:
// the only such cells on the fixtures were button labels (`Place`), which the page has no use for.
//
// ELECTRON-FREE.

import type { FontCell, FontRead } from './fontReader'
import { resolveIl } from './fontWords'
import type { OcrLine, OcrWord } from './ocr'
import type { Box } from './pixels'

/**
 * A cell matched exactly fits under this. Measured on the fixtures (2026-10-27): every correct cell
 * 0.0016-0.0173 (1x and 1.5x); art, the title bar and every cell at a scale the font does not fit
 * (Wu's Fist at 0.91, the Petamorph Wand: Mummy windows at 1.24 and 1.30) 0.023 and up.
 */
export const EXACT_FIT = 0.02

/** An OCR word this much under an exact cell is that cell's text, read again. */
const COVERED = 0.25

/** The cells read exactly: fit under EXACT_FIT, and a letter or digit in them (a lone `'` is art). */
export function exactCells(read: FontRead): FontCell[] {
  return read.cells.filter((c) => c.fit <= EXACT_FIT && /[A-Za-z0-9]/.test(c.text))
}

/**
 * A cell OCR read nothing under is added only with this many letters or digits: at 1.5x a sliver of
 * art fits a narrow glyph (`i`, `j`, `f`) exactly, and OCR's silence there is the better answer.
 */
const ALONE_MIN = 3

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0)

/** Shared area of two boxes, rows counted only when at least half the shorter's height. */
function shared(a: Box, b: Box): number {
  const x = overlap(a.x, a.x + a.w, b.x, b.x + b.w)
  const y = overlap(a.y, a.y + a.h, b.y, b.y + b.h)
  return x > 0 && y >= 0.5 * Math.min(a.h, b.h) ? x * y : 0
}

/**
 * The OCR line a cell sits on: the one whose words it covers most. Not the line's box: a junk word
 * read off the icon stretches a box over the next row (`8 Quest` took Black Lizard Scale's Class cell).
 */
function lineUnder(lines: readonly OcrLine[], c: Box): number {
  let best = -1
  let most = 0
  lines.forEach((l, i) => {
    const area = (l.words ?? []).reduce((sum, w) => sum + shared(w.box, c), 0)
    if (area > most) {
      most = area
      best = i
    }
  })
  return best
}

/** With no OCR word under it: the line beside it (rows shared with the line's own box), else none. */
function lineBeside(lines: readonly OcrLine[], c: Box): number {
  let best = -1
  let most = 0
  lines.forEach((l, i) => {
    const o = overlap(c.y, c.y + c.h, l.box.y, l.box.y + l.box.h)
    // A box much taller than the cell is a stretched one (above): not this cell's line.
    if (l.box.h <= 1.6 * c.h && o >= 0.5 * Math.min(c.h, l.box.h) && o > most) {
      most = o
      best = i
    }
  })
  return best
}

/** An OCR line's text with its exact cells in place of the words under them. */
function replaced(line: OcrLine, cells: readonly OcrWord[]): OcrLine {
  if (line.words === undefined) return line
  const kept = line.words.filter((w) => !cells.some((c) => overlap(w.box.x, w.box.x + w.box.w, c.box.x, c.box.x + c.box.w) > COVERED * w.box.w))
  const words = [...kept, ...cells].sort((a, b) => a.box.x - b.box.x)
  return { ...line, text: words.map((w) => w.text).join(' '), words }
}

/** OCR's lines, in OCR's order, with the font reader's exact cells in place of what OCR read there. */
export function mergeFont(lines: readonly OcrLine[], read: FontRead, counts: ReadonlyMap<string, number>): OcrLine[] {
  const byLine = new Map<number, OcrWord[]>()
  for (const c of exactCells(read)) {
    const word = { text: resolveIl(c.text.replace(/\s+/g, ' '), counts), box: c.box }
    const under = lineUnder(lines, c.box)
    if (under < 0 && (c.text.match(/[A-Za-z0-9]/g) ?? []).length < ALONE_MIN) continue
    const i = under >= 0 ? under : lineBeside(lines, c.box)
    if (i >= 0) byLine.set(i, [...(byLine.get(i) ?? []), word])
  }
  return lines.map((l, i) => {
    const cells = byLine.get(i)
    return cells === undefined ? l : replaced(l, cells)
  })
}
