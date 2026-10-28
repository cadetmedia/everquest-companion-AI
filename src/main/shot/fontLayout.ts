// fontLayout.ts — where the text of a game window is, for the font reader (fontReader.ts): each
// pixel's brightness, the background under thin bright strokes, the ink, its connected pieces, the
// lines, and each line's cells (runs of text split on wide gaps). Ported from the font reader proof
// of concept (owner, 2026-10-21; plans/2026-10-20-screenshot-to-wiki.md).
//
// ELECTRON-FREE.

import type { Rgba } from './pixels'

export interface Piece {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  h: number
  /** Ink pixels. */
  n: number
}

export interface Cell {
  x0: number
  x1: number
  pieces: Piece[]
}

export interface Line {
  y0: number
  y1: number
  pieces: Piece[]
  cells: Cell[]
}

export interface Layout {
  w: number
  h: number
  /** Brightness: the brightest channel (the game's text is white, red, green, yellow ...). */
  v: Float32Array
  /** Ink above the background. */
  ink: Uint8Array
  /** The kept pieces' own ink, for baselines. */
  textInk: Uint8Array
  /** 1 = the native 12 px Arial, a 16 px line pitch. */
  scale: number
  lines: Line[]
}

/** How far over the background a pixel is ink. */
const INK_DELTA = 45

function maxChannel(img: Rgba): Float32Array {
  const v = new Float32Array(img.w * img.h)
  for (let i = 0; i < v.length; i++) v[i] = Math.max(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2])
  return v
}

/** One channel of a picture. */
interface Plane {
  v: Float32Array
  w: number
  h: number
}

/** The erosion's reach and the box mean's, in pixels. */
const ERODE = 4
const BOX = 6

/** A separable minimum over +-r along one axis, the window cut at the picture's edge. */
function minAlong(p: Plane, r: number, horizontal: boolean): Plane {
  const { v, w, h } = p
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = horizontal ? x : y
      const end = Math.min(r, (horizontal ? w : h) - 1 - at)
      let m = 1e9
      for (let d = Math.max(-r, -at); d <= end; d++) m = Math.min(m, horizontal ? v[y * w + x + d] : v[(y + d) * w + x])
      out[y * w + x] = m
    }
  }
  return { v: out, w, h }
}

/** The background under thin bright strokes: a minimum (erosion), then a box mean. */
export function background(p: Plane): Float32Array {
  const { w, h } = p
  const rb = BOX
  const mn = minAlong(minAlong(p, ERODE, true), ERODE, false).v
  const W = w + 1
  const I = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += mn[y * w + x]
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row
    }
  }
  const bg = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rb)
      const x1 = Math.min(w, x + rb + 1)
      const y0 = Math.max(0, y - rb)
      const y1 = Math.min(h, y + rb + 1)
      bg[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0))
    }
  }
  return bg
}

interface InkGrid {
  ink: Uint8Array
  lab: Int32Array
  w: number
  h: number
}

/** The piece of ink holding pixel `start`, every pixel of it labelled `id`. */
function flood(g: InkGrid, start: number, id: number): Piece {
  const { ink, lab, w, h } = g
  const c: Piece = { id, x0: w, y0: h, x1: -1, y1: -1, w: 0, h: 0, n: 0 }
  const stack = [start]
  lab[start] = id
  while (stack.length > 0) {
    const j = stack.pop() ?? 0
    const x = j % w
    const y = (j / w) | 0
    c.n++
    c.x0 = Math.min(c.x0, x)
    c.x1 = Math.max(c.x1, x)
    c.y0 = Math.min(c.y0, y)
    c.y1 = Math.max(c.y1, y)
    for (const k of neighbours(x, y, w, h)) {
      if (ink[k] && lab[k] < 0) {
        lab[k] = id
        stack.push(k)
      }
    }
  }
  c.w = c.x1 - c.x0 + 1
  c.h = c.y1 - c.y0 + 1
  return c
}

/** 8-connected pieces of ink; `lab` gives each pixel's piece id, -1 off the ink. */
export function pieces(ink: Uint8Array, w: number, h: number): { pieces: Piece[]; lab: Int32Array } {
  const g = { ink, lab: new Int32Array(w * h).fill(-1), w, h }
  const out: Piece[] = []
  for (let i = 0; i < w * h; i++) if (ink[i] && g.lab[i] < 0) out.push(flood(g, i, out.length))
  return { pieces: out, lab: g.lab }
}

function neighbours(x: number, y: number, w: number, h: number): number[] {
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx
      const yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) out.push(yy * w + xx)
    }
  }
  return out
}

const pct = (a: readonly number[], q: number): number => {
  const s = [...a].sort((x, y) => x - y)
  return s.length > 0 ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0
}

/** A band of rows taller than a line holds two lines bridged by something: cut at its emptiest row. */
function splitBand(rows: Int32Array, span: [number, number], s: number, out: [number, number][]): void {
  const [y0, y1] = span
  if (y1 - y0 + 1 <= 18 * s) {
    out.push([y0, y1])
    return
  }
  let best = -1
  let bv = Infinity
  for (let yy = Math.round(y0 + 8 * s); yy <= y1 - 8 * s; yy++) {
    if (rows[yy] < bv) {
      bv = rows[yy]
      best = yy
    }
  }
  if (best < 0) {
    out.push([y0, y1])
    return
  }
  splitBand(rows, [y0, best - 1], s, out)
  splitBand(rows, [best + 1, y1], s, out)
}

function bands(ps: readonly Piece[], h: number, s: number): Line[] {
  const rows = new Int32Array(h)
  for (const c of ps) for (let y = c.y0; y <= c.y1; y++) rows[y] += c.n
  const spans: [number, number][] = []
  let y = 0
  while (y < h) {
    if (!rows[y]) {
      y++
      continue
    }
    const y0 = y
    while (y < h && rows[y]) y++
    splitBand(rows, [y0, y - 1], s, spans)
  }
  return spans
    // A piece belongs to the band holding most of its rows.
    .map(([y0, y1]) => ({ y0, y1, pieces: ps.filter((c) => Math.min(c.y1, y1) - Math.max(c.y0, y0) + 1 > c.h / 2), cells: [] }))
    .filter((b) => b.pieces.length > 0)
}

function cellsOf(line: Line, s: number): Cell[] {
  const out: Cell[] = []
  let cur: Cell | null = null
  for (const c of [...line.pieces].sort((a, b) => a.x0 - b.x0)) {
    if (cur !== null && c.x0 - cur.x1 <= 9 * s) {
      cur.x1 = Math.max(cur.x1, c.x1)
      cur.pieces.push(c)
    } else {
      cur = { x0: c.x0, x1: c.x1, pieces: [c] }
      out.push(cur)
    }
  }
  return out
}

/** Letter-sized pieces at scale s: no frame line, no filled block, no speck. */
const keepAt = (ps: readonly Piece[], s: number): Piece[] => ps.filter((c) => c.h <= 13 * s + 2 && !(c.w > 30 * s && c.n > 0.75 * c.w * c.h) && c.n >= 2)

/** The text of a window, laid out. */
export function layout(img: Rgba): Layout {
  const { w, h } = img
  const v = maxChannel(img)
  const bg = background({ v, w, h })
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) ink[i] = v[i] - bg[i] > INK_DELTA ? 1 : 0
  const found = pieces(ink, w, h)
  // Frame lines and specks go.
  const ps = found.pieces.filter((c) => !(c.h <= 3 && c.w > 20) && !(c.w <= 3 && c.h > 30) && c.h < 60)
  let scale = Math.max(0.8, pct(ps.filter((c) => c.h >= 5 && c.h <= 40).map((c) => c.h), 0.75) / 9.5)
  let kept = keepAt(ps, scale)
  let lines = bands(kept, h, scale)
  // The item window's rows are 16 px apart at 1x: the line pitch sets the scale when it is clear.
  const pitch: number[] = []
  for (let i = 1; i < lines.length; i++) pitch.push(lines[i].y1 - lines[i - 1].y1)
  const near = pitch.filter((d) => d >= 12 * scale && d <= 20 * scale)
  if (near.length >= 3) {
    scale = pct(near, 0.5) / 16
    kept = keepAt(ps, scale)
    lines = bands(kept, h, scale)
  }
  for (const l of lines) l.cells = cellsOf(l, scale)
  const keepIds = new Set(kept.map((c) => c.id))
  const textInk = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (found.lab[i] >= 0 && keepIds.has(found.lab[i])) textInk[i] = 1
  return { w, h, v, ink, textInk, scale, lines }
}
