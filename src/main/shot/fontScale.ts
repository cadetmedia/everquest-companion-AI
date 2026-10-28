// fontScale.ts — the window's UI scale for the font reader, to about 0.1%: a coarse sweep on the
// widest text cells (1x first, the common case), then each candidate refined by sliding the text it
// decodes, drawn at 1x and magnified, over the cell at finely spaced scales (a 400 px line drifts
// visibly at 0.2%). From the font reader proof of concept (owner, 2026-10-21).
//
// ELECTRON-FREE.

import type { FontAtlas } from './fontAtlas'
import { buildTemplates, cellBaseline, decodeCell, type Decoded, type Filter, type Templates } from './fontDecode'
import type { Cell, Layout, Line } from './fontLayout'

export interface CellAt {
  cell: Cell
  line: Line
}

export interface ScaleFit {
  s: number
  filt: Filter
  /** The pen's start and the baseline the refinement settled on (refined fits only). */
  x0?: number
  yb?: number
}

/** A cell's fit: the decode's error over the window's variance (0 is exact). */
export const fitOf = (d: Decoded): number => d.cost / d.varTot

/** The best fit of a prefix of each cell over a few baseline and pen offsets, averaged. */
function score(L: Layout, tpl: Templates, cs: readonly CellAt[]): number {
  const s = tpl.s
  let tot = 0
  for (const { cell, line } of cs) {
    const ybe = cellBaseline(L, cell, line, s)
    const xb = Math.min(cell.x1, cell.x0 + 28 * s)
    let bc = Infinity
    for (const dy of [-0.5, 0, 0.5]) {
      for (const ph of [0, 0.5]) bc = Math.min(bc, fitOf(decodeCell(L, tpl, { xa: cell.x0, xb, yb: ybe + dy, x0: Math.floor(cell.x0 - 2 * s) + ph })))
    }
    tot += bc
  }
  return tot / cs.length
}

/**
 * No candidate fits better than this: the window is not in this font, or at a scale it does not
 * magnify cleanly, and the reader stops (measured 2026-10-27: windows it reads 0.072-0.085, Wu's Fist
 * at 0.91 and the Petamorph Wand: Mummy windows at 1.24-1.36 0.27 and up).
 */
const NO_FIT = 0.18

/** Up to two candidate scales, best first; 1x alone when it explains the widest cell well; none when nothing fits. */
export function fitScale(L: Layout, atlas: FontAtlas, chars: readonly string[], cells: readonly CellAt[]): ScaleFit[] {
  const one = cells.slice(0, 1)
  const s0 = L.scale
  const all: { s: number; tot: number }[] = []
  const consider = (raw: number): number => {
    const s = +raw.toFixed(4)
    if (s < 0.6) return Infinity
    const tot = score(L, buildTemplates(atlas, s, chars, 'bilinear'), one)
    all.push({ s, tot })
    return tot
  }
  if (consider(1) < 0.12) return [{ s: 1, filt: 'bilinear' }]
  for (const n of [1.25, 1.5, 1.75, 2, 2.5, 3]) if (n >= s0 * 0.85 && n <= s0 * 1.15) consider(n)
  for (let s = s0 * 0.85; s <= s0 * 1.15; s += 0.025) consider(s)
  all.sort((a, b) => a.tot - b.tot)
  if (all.length === 0 || all[0].tot > NO_FIT) return []
  const top: { s: number }[] = []
  for (const c of all) if (top.length < 2 && top.every((t) => Math.abs(t.s / c.s - 1) > 0.015)) top.push(c)
  return top.map((c) => ({ s: c.s, filt: 'bilinear' }))
}

/** The 1x coverage of the glyphs a decode found, pen positions as decoded. */
function drawNative(atlas: FontAtlas, d: Decoded): { P: number; H: number; nat: Float32Array } {
  const P = d.P + 4
  const A = atlas.ascent
  const H = atlas.ascent + atlas.descent + 2
  const nat = new Float32Array(P * H)
  for (const { ch, p } of d.glyphs) {
    const g = atlas.glyphs[ch]
    const left = p + g.ox
    const top = A - g.oy
    // The glyph's own pixels that land inside the drawing.
    const i1 = Math.min(g.w, P - left)
    const j1 = Math.min(g.h, H - top)
    for (let j = Math.max(0, -top); j < j1; j++) {
      for (let i = Math.max(0, -left); i < i1; i++) nat[(top + j) * P + left + i] = Math.min(1, nat[(top + j) * P + left + i] + g.cov[j * g.w + i])
    }
  }
  return { P, H, nat }
}

interface Drawn {
  P: number
  H: number
  A: number
  sample: (u: number, v: number) => number
}

function sampler(atlas: FontAtlas, d: Decoded, filt: Filter): Drawn {
  const { P, H, nat } = drawNative(atlas, d)
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= P || j >= H ? 0 : nat[j * P + i])
  const sample = (u: number, v: number): number => {
    if (filt === 'nearest') return at(Math.floor(u), Math.floor(v))
    const fu = u - 0.5
    const fv = v - 0.5
    const iu = Math.floor(fu)
    const iv = Math.floor(fv)
    const tu = fu - iu
    const tv = fv - iv
    return at(iu, iv) * (1 - tu) * (1 - tv) + at(iu + 1, iv) * tu * (1 - tv) + at(iu, iv + 1) * (1 - tu) * tv + at(iu + 1, iv + 1) * tu * tv
  }
  return { P, H, A: atlas.ascent, sample }
}

/** Pearson correlation of the drawn text, at scale sc and origin (xx, yy), with the picture. */
function correlation(L: Layout, dr: Drawn, sc: number, at: { xx: number; yy: number; xb: number }): number {
  const { xx, yy, xb } = at
  const X0 = Math.floor(xx)
  const X1 = Math.min(Math.ceil(xb + 2), Math.ceil(xx + sc * dr.P))
  const Y0 = Math.floor(yy - sc * dr.A) - 1
  const Y1 = Math.ceil(yy + sc * (dr.H - dr.A)) + 1
  let n = 0
  let sa = 0
  let sb = 0
  let saa = 0
  let sbb = 0
  let sab = 0
  for (let Y = Math.max(0, Y0); Y < Math.min(L.h, Y1); Y++) {
    for (let X = Math.max(0, X0); X < Math.min(L.w, X1); X++) {
      const t = dr.sample((X + 0.5 - xx) / sc, (Y + 0.5 - yy) / sc + dr.A)
      const o = L.v[Y * L.w + X]
      n++
      sa += t
      sb += o
      saa += t * t
      sbb += o * o
      sab += t * o
    }
  }
  return (n * sab - sa * sb) / Math.sqrt(Math.max(1e-9, (n * saa - sa * sa) * (n * sbb - sb * sb)))
}

/** The best correlation at scale sc over +-half a pixel across and a quarter down. */
function bestShift(L: Layout, dr: Drawn, sc: number, at: { x0: number; yb: number; xb: number }): number {
  let bc = -2
  for (let dx = -0.5; dx <= 0.5; dx += 0.25) {
    for (let dy = -0.25; dy <= 0.25; dy += 0.25) bc = Math.max(bc, correlation(L, dr, sc, { xx: at.x0 + dx, yy: at.yb + dy, xb: at.xb }))
  }
  return bc
}

/** The scale within +-range (steps of `step`) whose drawing correlates best. */
function sweep(L: Layout, dr: Drawn, at: { s: number; x0: number; yb: number; xb: number }, steps: { range: number; step: number }): number {
  let bs = at.s
  let bc = -2
  const k1 = Math.round(steps.range / steps.step)
  for (let k = -k1; k <= k1; k++) {
    const sc = at.s * (1 + k * steps.step)
    const c = bestShift(L, dr, sc, at)
    if (c > bc) {
      bc = c
      bs = sc
    }
  }
  return bs
}

/** The decode of a prefix of the cell with the lowest fit over the offsets tried. */
function bestStart(L: Layout, tpl: Templates, c: CellAt, at: { xb: number; x0: number | null; yb: number | null }): { x0: number; yb: number; d: Decoded } {
  const s = tpl.s
  const ybe = at.yb ?? cellBaseline(L, c.cell, c.line, s)
  const dys = at.yb === null ? [-0.5, 0, 0.5] : [-0.25, 0, 0.25]
  const phs = at.x0 === null ? [0, 0.25, 0.5, 0.75] : [-0.25, 0, 0.25]
  let best: { n: number; x0: number; yb: number; d: Decoded } | null = null
  for (const dy of dys) {
    for (const ph of phs) {
      const x0 = at.x0 === null ? Math.floor(c.cell.x0 - 2 * s) + ph : at.x0 + ph
      const d = decodeCell(L, tpl, { xa: c.cell.x0, xb: at.xb, yb: ybe + dy, x0 })
      if (best === null || fitOf(d) < best.n) best = { n: fitOf(d), x0, yb: ybe + dy, d }
    }
  }
  return best ?? { x0: 0, yb: 0, d: decodeCell(L, tpl, { xa: c.cell.x0, xb: at.xb, yb: ybe, x0: c.cell.x0 }) }
}

/** A candidate scale refined on the widest cell, longer prefixes and finer steps each round. */
export function refineScale(L: Layout, font: { atlas: FontAtlas; chars: readonly string[] }, fit: ScaleFit, c: CellAt): ScaleFit & { x0: number; yb: number } {
  const { atlas, chars } = font
  let s = fit.s
  let x0: number | null = null
  let yb: number | null = null
  for (const [len, range, step] of [
    [30, 0.03, 0.001],
    [110, 0.004, 0.0004],
    [400, 0.0015, 0.0002]
  ]) {
    const xb = Math.min(c.cell.x1, c.cell.x0 + len * s)
    const best = bestStart(L, buildTemplates(atlas, s, chars, fit.filt), c, { xb, x0, yb })
    x0 = best.x0
    yb = best.yb
    if (best.d.glyphs.length < 3) break
    s = sweep(L, sampler(atlas, best.d, fit.filt), { s, x0, yb, xb }, { range, step })
    if (xb >= c.cell.x1) break
  }
  return { s: +s.toFixed(4), filt: fit.filt, x0: x0 ?? 0, yb: yb ?? 0 }
}
