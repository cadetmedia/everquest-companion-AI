// iconMatch.ts — which icon a picture shows: the content box resized to 16x16 RGB against every
// icon (iconIndex.ts), an aspect penalty, then the top 50 re-scored at full size. Ported from the
// 2026-10-20 prototype (13 of 13 labelled crops of the wiki's own Icon Finder at rank 1; 94.7%
// top-1 on degraded random icons). The query is expected over black: backgrounds are removed first
// (background.ts).
//
// The prototype found a Node 24 JIT fault that gave a wrong re-rank score about one run in ten
// until each hot loop sat in its own small function; they stay that way here.
//
// ELECTRON-FREE.

import { contentBox, resizeRgb, type Box, type Rgb } from './pixels'
import { ICON_CELL } from './gameTextures'
import { cellRgb, featureOf, FD, type IconIndex } from './iconIndex'

export interface IconHit {
  id: number
  /** Mean squared error per content pixel; lower is closer. */
  score: number
}

// ---- a frame of one colour (a pasted slot or tile) --------------------------------------------

type Px = (x: number, y: number) => number

const dist3 = (rgb: Float32Array, p: number, c: readonly number[]): number => Math.abs(rgb[p] - c[0]) + Math.abs(rgb[p + 1] - c[1]) + Math.abs(rgb[p + 2] - c[2])

/** The frame colour most of the outer ring agrees with; null when there is no frame, or a dark one. */
function frameColour(q: Rgb, at: Px): number[] | null {
  const ring: number[] = []
  for (let x = 0; x < q.w; x++) ring.push(at(x, 0), at(x, q.h - 1))
  for (let y = 0; y < q.h; y++) ring.push(at(0, y), at(q.w - 1, y))
  let best: number[] = [0, 0, 0]
  let bestN = -1
  for (const p of [at(0, 0), at(q.w - 1, 0), at(0, q.h - 1), at(q.w - 1, q.h - 1)]) {
    const c = [q.rgb[p], q.rgb[p + 1], q.rgb[p + 2]]
    const n = ring.filter((r) => dist3(q.rgb, r, c) < 24).length
    if (n > bestN) [best, bestN] = [c, n]
  }
  return bestN < 0.5 * ring.length || Math.max(...best) <= 48 ? null : best
}

/** Peel rows and columns that are >= 90% frame colour, then up to 3 more of frame blended to black. */
function peelFrame(q: Rgb, at: Px, c: readonly number[]): Box {
  const cc2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2]
  const off = (p: number): number => {
    if (Math.max(q.rgb[p], q.rgb[p + 1], q.rgb[p + 2]) <= 48) return 0
    const a = Math.min(1.1, (q.rgb[p] * c[0] + q.rgb[p + 1] * c[1] + q.rgb[p + 2] * c[2]) / cc2)
    return Math.abs(q.rgb[p] - a * c[0]) + Math.abs(q.rgb[p + 1] - a * c[1]) + Math.abs(q.rgb[p + 2] - a * c[2])
  }
  const isFrame = (ps: number[]): boolean => ps.filter((p) => dist3(q.rgb, p, c) < 24).length >= 0.9 * ps.length
  const isBlend = (ps: number[]): boolean => ps.every((p) => off(p) < 60) && ps.filter((p) => off(p) >= 24).length <= 0.03 * ps.length
  const b = { x0: 0, y0: 0, x1: q.w - 1, y1: q.h - 1 }
  const line = (side: keyof typeof b): number[] =>
    side === 'y0' || side === 'y1'
      ? Array.from({ length: b.x1 - b.x0 + 1 }, (_, i) => at(b.x0 + i, b[side]))
      : Array.from({ length: b.y1 - b.y0 + 1 }, (_, i) => at(b[side], b.y0 + i))
  const step = { y0: 1, y1: -1, x0: 1, x1: -1 }
  for (const [test, limit] of [[isFrame, Infinity], [isBlend, 3]] as const) {
    for (const side of ['y0', 'y1', 'x0', 'x1'] as const) {
      for (let n = 0; n < limit && b.x1 - b.x0 > 4 && b.y1 - b.y0 > 4 && test(line(side)); n++) b[side] += step[side]
    }
  }
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }
}

/** Where the icon sits in the query: inside a one-colour frame if there is one, then its content box. */
function queryBox(q: Rgb): Box {
  const at: Px = (x, y) => (y * q.w + x) * 3
  const c = frameColour(q, at)
  const outer = c === null ? { x: 0, y: 0, w: q.w, h: q.h } : peelFrame(q, at, c)
  const sub = resizeRgb(q, outer, outer)
  const cb = contentBox(sub, outer.w, outer.h)
  return cb === null ? outer : { x: outer.x + cb.x, y: outer.y + cb.y, w: cb.w, h: cb.h }
}

function sqDist(feats: Uint8Array, o: number, qf: Float32Array): number {
  let s = 0
  for (let k = 0; k < FD; k++) {
    const d = feats[o + k] - qf[k]
    s += d * d
  }
  return s
}

/** Every icon's coarse score: vector distance plus a penalty when the content box shape disagrees. */
function coarseScores(index: IconIndex, qf: Float32Array, box: Box): Float32Array {
  const scores = new Float32Array(index.n)
  const qAspect = box.w / box.h
  for (let i = 0; i < index.n; i++) {
    const ar = Math.log(index.boxes[i * 4 + 2] / index.boxes[i * 4 + 3] / qAspect)
    scores[i] = sqDist(index.feats, i * FD, qf) / FD + 2000 * ar * ar
  }
  return scores
}

function ssd(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let k = 0; k < a.length; k++) {
    const d = a[k] - b[k]
    s += d * d
  }
  return s
}

/** A region of the query, out-of-bounds as black, resampled to dw x dh. */
function sampleRgb(q: Rgb, r: Box, dw: number, dh: number): Float32Array {
  const pad = Math.ceil(Math.max(r.w / dw, r.h / dh)) + 2
  const x0 = Math.floor(r.x) - pad
  const y0 = Math.floor(r.y) - pad
  const W = Math.ceil(r.w) + 2 * pad
  const H = Math.ceil(r.h) + 2 * pad
  const tmp = new Float32Array(W * H * 3)
  for (let yy = 0; yy < H; yy++) {
    const Y = y0 + yy
    if (Y < 0 || Y >= q.h) continue
    for (let xx = 0; xx < W; xx++) {
      const X = x0 + xx
      if (X < 0 || X >= q.w) continue
      tmp.set(q.rgb.subarray((Y * q.w + X) * 3, (Y * q.w + X) * 3 + 3), (yy * W + xx) * 3)
    }
  }
  return resizeRgb({ rgb: tmp, w: W }, { x: r.x - x0, y: r.y - y0, w: r.w, h: r.h }, { w: dw, h: dh })
}

const JITTER: readonly (readonly [number, number])[] = [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]

/**
 * The candidate's whole cell mapped into the query through the two content boxes, compared per
 * content pixel (so a tiny mostly-black icon cannot win), best of a half-pixel jitter.
 */
function rerankScore(q: Rgb, box: Box, cell: Float32Array, cb: Box): number {
  const sx = box.w / cb.w
  const sy = box.h / cb.h
  let best = Infinity
  for (const [dx, dy] of JITTER) {
    const r = sampleRgb(q, { x: box.x - (cb.x - dx) * sx, y: box.y - (cb.y - dy) * sy, w: ICON_CELL * sx, h: ICON_CELL * sy }, ICON_CELL, ICON_CELL)
    best = Math.min(best, ssd(r, cell) / (3 * cb.w * cb.h))
  }
  return best
}

/** The `top` closest icons to a picture over black. `cellOf` gives an icon's full 40x40 RGBA. */
/** Coarse candidates re-scored at full size. */
const RERANK = 50

export function findIcon(q: Rgb, index: IconIndex, cellOf: (id: number) => Uint8Array | null, top = 10): IconHit[] {
  const box = queryBox(q)
  const scores = coarseScores(index, featureOf(q.rgb, q.w, box), box)
  const order = [...scores.keys()].sort((a, b) => scores[a] - scores[b]).slice(0, Math.max(RERANK, top))
  const hits = order.flatMap((i): IconHit[] => {
    const cell = cellOf(index.ids[i])
    if (cell === null) return []
    const b = index.boxes.subarray(i * 4, i * 4 + 4)
    return [{ id: index.ids[i], score: rerankScore(q, box, cellRgb(cell), { x: b[0], y: b[1], w: b[2], h: b[3] }) }]
  })
  return hits.sort((a, b) => a.score - b.score).slice(0, top)
}

/** How clearly the best hit wins: runner-up over winner (1 is a tie; the prototype's clear wins ran 3 to 15). */
export function margin(hits: readonly IconHit[]): number {
  return hits.length < 2 ? Infinity : hits[1].score / Math.max(1e-6, hits[0].score)
}
