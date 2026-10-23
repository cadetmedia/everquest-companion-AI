// journalLines.ts — a Quest Journal window's text, for shared/questJournal.ts (owner, 2026-10-22). The
// journal draws small light text on the dark rock skin, a selected task on a grey bar: read as an item
// window is (ocr.ts at about 1x for a window this big), the rock's grain swallowed whole rows (the
// selected `Something Fishy` row was not read at all). Measured on the owner's three windows
// (tests/fixtures/shots/quest-journal-*.png): every pixel whose brightest channel is under FLOOR made
// black (the rock is 13 at its median, the grey bar 128, the text 170 and up), and the picture doubled,
// reads every row; 110 and 170 and a tripling read worse.
//
// Each line also carries its background's brightness (the median of the brightest channel over its
// box in the picture as pasted), so the reader knows the selected row.
//
// ELECTRON-FREE: the caller hands in the pixels.

import { readLines } from './ocr'
import type { Box, Rgba } from './pixels'

/** Darker than this is the skin, never text. */
export const FLOOR = 130
/** The journal's text is small: doubled before the read. */
export const UPSCALE = 2

/** The picture with the skin blacked out, each pixel its brightest channel, `UPSCALE` times as large. */
export function journalPrep(img: Rgba): Rgba {
  const k = UPSCALE
  const w = img.w * k
  const h = img.h * k
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / k)
    for (let x = 0; x < w; x++) {
      const p = (sy * img.w + Math.floor(x / k)) * 4
      const m = Math.max(img.data[p], img.data[p + 1], img.data[p + 2])
      const v = m < FLOOR ? 0 : m
      const q = (y * w + x) * 4
      data[q] = v
      data[q + 1] = v
      data[q + 2] = v
      data[q + 3] = 255
    }
  }
  return { w, h, data }
}

/** The median of the brightest channel over a box of the picture as pasted. */
export function boxShade(img: Rgba, box: Box): number {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w))
  const y1 = Math.min(img.h, Math.ceil(box.y + box.h))
  const v: number[] = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * img.w + x) * 4
      v.push(Math.max(img.data[p], img.data[p + 1], img.data[p + 2]))
    }
  }
  v.sort((a, b) => a - b)
  return v.length === 0 ? 0 : v[v.length >> 1]
}

/** The journal's lines, top to bottom, each with its background's brightness. */
export async function readJournalLines(img: Rgba): Promise<{ lines: string[]; shades: number[] }> {
  const read = await readLines(journalPrep(img))
  const box = (b: Box): Box => ({ x: b.x / UPSCALE, y: b.y / UPSCALE, w: b.w / UPSCALE, h: b.h / UPSCALE })
  return { lines: read.map((l) => l.text), shades: read.map((l) => boxShade(img, box(l.box))) }
}
