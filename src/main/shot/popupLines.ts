// popupLines.ts — a game popup window's text (the tutorial's Navigation, Combat, Skills and Abilities
// and Your First Quest Reward! windows), for shared/questPopup.ts (owner, 2026-10-23: "doug gives a
// quest text and a popup ... i need it to know about this so i can create the quest page"). Measured on
// the Navigation window (tests/fixtures/shots/popup-navigation.png): each pixel's brightest channel,
// scaled up three times SMOOTHLY (bilinear) and read as it is, gets 7 of 8 hard words right (Norrath,
// triangle, first time, interest in, NPCs, arriving, the title); the journal's blacked-out, doubled
// picture got 3 of 8 (`Morrath`, `amiving`, `interestin`). Only `corner` still reads `comer`. A square
// root lifted the Combat window's dim `Grey:` (else `Crev`) but cost the letter t across the windows
// (`Targeling`, `real ime`, `indable`): rejected; the legend's order fills that word (questPopup.ts).
//
// Each line also carries where its text sits and its colour, from the picture as pasted: the window
// writes sub-headings in yellow (`Map:`), the quest's instruction in orange (`Find your way to Old
// Doug ...`) and the rest in white, with key names in cyan inside white lines. A line's box can take
// in scrollbar or frame marks above or below it, so its text band is found from the bright rows.
//
// ELECTRON-FREE: the caller hands in the pixels.

import { readLines } from './ocr'
import type { Box, Rgba } from './pixels'

/** The popup's text is small and crisp: scaled up this much, smoothly, before the read. */
export const POPUP_SCALE = 3
/** Brighter than this (any channel) is text, never the window's dark skin. */
const TEXT_FLOOR = 130

export type PopupTone = 'white' | 'yellow' | 'orange'

/** Each pixel its brightest channel, `POPUP_SCALE` times as large, bilinear. */
export function popupPrep(img: Rgba): Rgba {
  const k = POPUP_SCALE
  const w = img.w * k
  const h = img.h * k
  const data = new Uint8Array(w * h * 4)
  const at = (x: number, y: number): number => {
    const p = (y * img.w + x) * 4
    return Math.max(img.data[p], img.data[p + 1], img.data[p + 2])
  }
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1.001, Math.max(0, (y + 0.5) / k - 0.5))
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1.001, Math.max(0, (x + 0.5) / k - 0.5))
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const v = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
      const q = (y * w + x) * 4
      const g = Math.round(v)
      data[q] = g
      data[q + 1] = g
      data[q + 2] = g
      data[q + 3] = 255
    }
  }
  return { w, h, data }
}

/** A text pixel's colour: yellow (sub-heading), orange (instruction), else white (cyan keys count as white). */
function toneOfPixel(r: number, g: number, b: number): PopupTone {
  if (b < 80 && r > 120 && g < r * 0.7) return 'orange'
  if (b < 80 && r > 120 && g >= r * 0.8) return 'yellow'
  return 'white'
}

/** Count the text pixels of each row of a box: where the line's letters sit. */
function brightRows(img: Rgba, box: Box): number[] {
  const x0 = Math.max(0, Math.floor(box.x))
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w))
  const y0 = Math.max(0, Math.floor(box.y))
  const y1 = Math.min(img.h, Math.ceil(box.y + box.h))
  const rows: number[] = []
  for (let y = y0; y < y1; y++) {
    let n = 0
    for (let x = x0; x < x1; x++) {
      const p = (y * img.w + x) * 4
      if (Math.max(img.data[p], img.data[p + 1], img.data[p + 2]) >= TEXT_FLOOR) n++
    }
    rows.push(n)
  }
  return rows
}

/** The `band` rows of the box holding the most text: the line itself, not a mark the box took in. */
function textBand(img: Rgba, box: Box, band: number): { top: number; height: number } {
  const rows = brightRows(img, box)
  const span = Math.max(1, Math.min(rows.length, band))
  let best = 0
  let bestAt = 0
  for (let i = 0; i + span <= rows.length; i++) {
    let s = 0
    for (let j = i; j < i + span; j++) s += rows[j]
    if (s > best) {
      best = s
      bestAt = i
    }
  }
  return { top: Math.floor(box.y) + bestAt, height: span }
}

/** The colour most of a band's text pixels are. */
function bandTone(img: Rgba, box: Box, top: number, height: number): PopupTone {
  const n: Record<PopupTone, number> = { white: 0, yellow: 0, orange: 0 }
  const x0 = Math.max(0, Math.floor(box.x))
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w))
  for (let y = Math.max(0, top); y < Math.min(img.h, top + height); y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * img.w + x) * 4
      const r = img.data[p]
      const g = img.data[p + 1]
      const b = img.data[p + 2]
      if (Math.max(r, g, b) >= TEXT_FLOOR) n[toneOfPixel(r, g, b)]++
    }
  }
  return (Object.keys(n) as PopupTone[]).reduce((a, k) => (n[k] > n[a] ? k : a), 'white')
}

/**
 * The colour a band OPENS in: its first fifth. `Continue to talk with Doug` is orange and the rest of
 * its line white (Your first quest!), so the line's majority alone hides the instruction.
 */
function leadTone(img: Rgba, box: Box, top: number, height: number): PopupTone {
  return bandTone(img, { ...box, w: box.w / 5 }, top, height)
}

/** Whether a band holds an item link's magenta (`Boots of the Long Road` on the reward popup). */
function hasMagenta(img: Rgba, box: Box, top: number, height: number): boolean {
  let n = 0
  const x0 = Math.max(0, Math.floor(box.x))
  const x1 = Math.min(img.w, Math.ceil(box.x + box.w))
  for (let y = Math.max(0, top); y < Math.min(img.h, top + height); y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * img.w + x) * 4
      if (img.data[p] > 150 && img.data[p + 2] > 150 && img.data[p + 1] < 90) n++
    }
  }
  return n >= 30
}

/** A strip of the picture, the middle `share` of its width. */
function strip(img: Rgba, y0: number, y1: number, share: number): Rgba {
  const x0 = Math.floor((img.w * (1 - share)) / 2)
  const w = Math.max(1, Math.floor(img.w * share))
  const h = Math.max(1, y1 - y0)
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + w) * 4), y * w * 4)
  return { w, h, data }
}

/**
 * The popup's lines, top to bottom: text, where its letters sit (source pixels), its colour and whether
 * it holds an item link. The title bar is read again on its own (`titleLines`): in the full read its
 * small grey text ran together (`YourFirstQuestRewara`) while the strip alone reads `Your First Quest
 * Reward!`. `titleBottom` is where the body starts.
 */
export async function readPopupLines(img: Rgba): Promise<{ lines: string[]; tops: number[]; heights: number[]; tones: PopupTone[]; leads: PopupTone[]; items: boolean[]; titleLines: string[]; titleBottom: number }> {
  const read = await readLines(popupPrep(img))
  const k = POPUP_SCALE
  const boxes = read.map((l): Box => ({ x: l.box.x / k, y: l.box.y / k, w: l.box.w / k, h: l.box.h / k }))
  const sorted = boxes.map((b) => b.h).sort((a, b) => a - b)
  const band = Math.max(1, Math.round(sorted[sorted.length >> 1] ?? 1))
  const bands = boxes.map((b) => textBand(img, b, band))
  // The body starts at the first line well below the top: the title bar's text sits within ~1.7 lines.
  const titleBottom = Math.min(img.h, ...bands.map((b) => b.top).filter((t) => t >= band * 1.7)) - 2
  const titleLines = titleBottom >= band ? (await readLines(popupPrep(strip(img, 0, titleBottom, 0.6)))).map((l) => l.text) : []
  return {
    lines: read.map((l) => l.text),
    tops: bands.map((b) => b.top),
    heights: bands.map((b) => b.height),
    tones: boxes.map((b, i) => bandTone(img, b, bands[i].top, bands[i].height)),
    leads: boxes.map((b, i) => leadTone(img, b, bands[i].top, bands[i].height)),
    items: boxes.map((b, i) => hasMagenta(img, b, bands[i].top, bands[i].height)),
    titleLines,
    titleBottom
  }
}
