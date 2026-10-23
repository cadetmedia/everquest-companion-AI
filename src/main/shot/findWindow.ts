// findWindow.ts — find an item window in a capture of the whole EverQuest window (phase 3 of
// screenshot to wiki; owner, 2026-10-21: capture from the game and auto-find).
//
// The anchor is the selected tab's label: the game draws it in yellow (`Description`, or `Lore` when
// that tab is showing). Yellow is `max(r,g) >= 100 and b*3 < r` (the idea from
// AustonZ/EQL-Wiki-Editor-Assistant, MIT, ItemWindowLocator.cs; no code taken). Text in yellow is
// rare elsewhere on the screen, and every candidate is read before it is believed (readItemShot), so
// a yellow chat line costs a read, never a wrong page. The label's height sets the scale, so no UI
// scale is assumed (whole-number or not). The window's sides are the strongest straight vertical
// edges either side of the label, its bottom the first straight edge across them.
//
// ELECTRON-FREE.

import { clipBox, type Box, type Rgba } from './pixels'

const isYellow = (d: Uint8Array, p: number): boolean => Math.max(d[p], d[p + 1]) >= 100 && d[p + 2] * 3 < d[p] && d[p + 1] >= 0.6 * d[p]

/** The yellow neighbours of pixel j not yet seen, marked seen. */
function nextYellow(img: Rgba, seen: Uint8Array, j: number): number[] {
  const { w, h, data } = img
  const x = j % w
  return [j - 1, j + 1, j - w, j + w].filter((k) => {
    const ok = k >= 0 && k < w * h && seen[k] === 0 && Math.abs((k % w) - x) <= 1 && isYellow(data, k * 4)
    if (ok) seen[k] = 1
    return ok
  })
}

/** The 4-connected yellow pixels from `start`: their box and count. */
function flood(img: Rgba, seen: Uint8Array, start: number): Box & { n: number } {
  const b = { x0: img.w, y0: img.h, x1: 0, y1: 0, n: 0 }
  const stack = [start]
  seen[start] = 1
  while (stack.length > 0) {
    const j = stack.pop() ?? 0
    const x = j % img.w
    const y = (j - x) / img.w
    ;[b.x0, b.y0, b.x1, b.y1, b.n] = [Math.min(b.x0, x), Math.min(b.y0, y), Math.max(b.x1, x), Math.max(b.y1, y), b.n + 1]
    stack.push(...nextYellow(img, seen, j))
  }
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, n: b.n }
}

/** Boxes of 4-connected yellow pixels, with their pixel counts. */
function yellowBlobs(img: Rgba): (Box & { n: number })[] {
  const seen = new Uint8Array(img.w * img.h)
  const out: (Box & { n: number })[] = []
  for (let i = 0; i < img.w * img.h; i++) {
    if (seen[i] === 1 || !isYellow(img.data, i * 4)) continue
    const blob = flood(img, seen, i)
    if (blob.n >= 3) out.push(blob)
  }
  return out
}

/** Glyph blobs joined into words: on one line, no more than half a letter height apart. */
function words(blobs: readonly Box[]): Box[] {
  const sorted = [...blobs].sort((a, b) => a.x - b.x)
  const out: Box[] = []
  for (const b of sorted) {
    const word = out.find((o) => b.x - (o.x + o.w) <= Math.max(3, 0.5 * o.h) && b.x >= o.x && b.y < o.y + o.h && b.y + b.h > o.y)
    if (word === undefined) {
      out.push({ ...b })
      continue
    }
    const [x1, y1] = [Math.max(word.x + word.w, b.x + b.w), Math.max(word.y + word.h, b.y + b.h)]
    word.y = Math.min(word.y, b.y)
    word.w = x1 - word.x
    word.h = y1 - word.y
  }
  return out
}

/**
 * The yellow words shaped like a tab label, best first: `Description` (about 6 heights wide) or
 * `Lore` (about 2.5), 6 to 60 px tall.
 */
export function tabLabels(img: Rgba): Box[] {
  const shape = (b: Box): number => Math.min(Math.abs(b.w / b.h - 6.2), Math.abs(b.w / b.h - 2.6))
  return words(yellowBlobs(img))
    .filter((b) => b.h >= 6 && b.h <= 60 && shape(b) < 1.6)
    .sort((a, b) => shape(a) - shape(b))
}

/** Mean |step| across x (vertical edges) at column x, over rows y0..y1. */
function colEdge(img: Rgba, x: number, y0: number, y1: number): number {
  let s = 0
  for (let y = y0; y < y1; y++) {
    const p = (y * img.w + x) * 4
    s += Math.abs(img.data[p + 1] - img.data[p + 5])
  }
  return s / Math.max(1, y1 - y0)
}

/** Mean |step| across y (horizontal edges) at row y, over columns x0..x1. */
function rowEdge(img: Rgba, y: number, x0: number, x1: number): number {
  let s = 0
  for (let x = x0; x < x1; x++) {
    const p = (y * img.w + x) * 4
    s += Math.abs(img.data[p + 1] - img.data[p + 1 + img.w * 4])
  }
  return s / Math.max(1, x1 - x0)
}

/** Share of rows a side's edge must hold on: a frame steps on every row, an icon or a word on some. */
const STEADY_SHARE = 0.8

/** The |step| across x at column x that STEADY_SHARE of rows y0..y1 reach. */
function colSteady(img: Rgba, x: number, y0: number, y1: number): number {
  const steps: number[] = []
  for (let y = y0; y < y1; y++) {
    const p = (y * img.w + x) * 4
    steps.push(Math.abs(img.data[p + 1] - img.data[p + 5]))
  }
  steps.sort((a, b) => a - b)
  return steps.length === 0 ? 0 : steps[Math.floor(steps.length * (1 - STEADY_SHARE))]
}

/** A side is any column this share of the steadiest one in reach; the nearest such wins. */
const FRAME_SHARE = 0.6

/**
 * The window's side in [from, to): the column nearest the label (`near`) whose edge holds down the
 * rows given, at least FRAME_SHARE of the steadiest in reach. Not the strongest: with windows side
 * by side, the neighbour's frame, further out, is stronger than this window's own (owner's
 * screenshots, 2026-10-22: 97 against 85), and the item icon is nearly as strong (82) but only for
 * part of the rows, which STEADY_SHARE drops.
 */
function sideCol(img: Rgba, reach: { from: number; to: number; near: number }, rows: readonly [number, number]): number {
  const cols: { x: number; e: number }[] = []
  for (let x = Math.max(0, reach.from); x < Math.min(img.w - 1, reach.to); x++) cols.push({ x, e: colSteady(img, x, rows[0], rows[1]) })
  const best = Math.max(0, ...cols.map((c) => c.e))
  const sides = cols.filter((c) => best > 0 && c.e >= FRAME_SHARE * best)
  return sides.reduce((a, c) => (Math.abs(c.x - reach.near) < Math.abs(a.x - reach.near) ? c : a), sides[0] ?? { x: reach.from }).x
}

/**
 * The item window around a tab label. Sides: the nearest steady vertical edges within 24 label
 * heights left and right (`sideCol`), over the rows just under the tab row. Bottom: the first row below the text whose
 * edge runs across the window (the frame), else the capture's bottom. The title bar above the label is kept.
 */
export function windowAround(img: Rgba, label: Box): Box | null {
  const u = label.h
  const rows: [number, number] = [Math.min(img.h - 1, Math.round(label.y + 3 * u)), Math.min(img.h - 1, Math.round(label.y + 10 * u))]
  // Sides over a taller band than `rows`: the item icon fills most of 3-10 heights, about half of 3-16.
  const body: [number, number] = [rows[0], Math.min(img.h - 1, Math.round(label.y + 16 * u))]
  const left = sideCol(img, { from: Math.round(label.x - 24 * u), to: Math.round(label.x - u), near: label.x }, body)
  const right = sideCol(img, { from: Math.round(label.x + label.w + u), to: Math.round(label.x + label.w + 24 * u), near: label.x + label.w }, body)
  const span = right - left
  if (span < 8 * u) return null
  const bottom = bottomOf(img, { left, right, from: Math.round(label.y + 12 * u), side: (colEdge(img, left, rows[0], rows[1]) + colEdge(img, right, rows[0], rows[1])) / 2 }, u)
  return clipBox({ x: left - 2, y: label.y - 4 * u, w: span + 4, h: bottom - label.y + 4 * u + 2 }, img.w, img.h)
}

/**
 * The window's bottom: the first edge across it below which its sides stop (an inner rule, such as
 * the exaltation rows' separator, has the sides going on past it). The capture's bottom when none.
 */
function bottomOf(img: Rgba, at: { left: number; right: number; from: number; side: number }, u: number): number {
  const below = (y: number): number => (colEdge(img, at.left, y + 2, y + 2 + u) + colEdge(img, at.right, y + 2, y + 2 + u)) / 2
  for (let y = at.from; y < img.h - 2 - u; y++) {
    if (rowEdge(img, y, at.left + 2, at.right - 2) > 40 && below(y) < at.side / 2) return y
  }
  return img.h - 1
}
