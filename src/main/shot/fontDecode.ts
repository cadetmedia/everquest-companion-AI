// fontDecode.ts — one cell of window text read against the game's own glyphs (fontAtlas.ts). The
// native 12 px glyphs are magnified by the window's UI scale with bilinear (or nearest) filtering,
// as the game magnifies its glyph quads, and matched along the cell by dynamic programming over the
// native pen position: each glyph advances the pen by its own integer advance, so `rn` and `m` are
// two paths over the same pixels and the cheaper one wins. Each glyph solves its own background and
// brightness by least squares. From the font reader proof of concept (owner, 2026-10-21).
//
// ELECTRON-FREE.

import type { FontAtlas, FontGlyph } from './fontAtlas'
import type { Cell, Layout, Line } from './fontLayout'

/** Sub-pixel phase steps. */
const Q = 4

export type Filter = 'bilinear' | 'nearest'

interface Phase {
  /** The first output column, from floor(pen). */
  c0: number
  ncols: number
  d: Float32Array
  st: number
  st2: number
}

interface Template {
  ch: string
  adv: number
  /** By x phase * Q + y phase. */
  per: Phase[]
}

export interface Templates {
  s: number
  T: Template[]
  rowsAbove: number
  nrows: number
}

/** A glyph's coverage at its pixel (i, j); 0 off it. Module level: a closure per sample was the hot spot. */
function covAt(g: FontGlyph, i: number, j: number): number {
  return i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : g.cov[j * g.w + i]
}

/** A glyph's coverage at native (u, v): u from the pen, v down from the baseline. */
function sampleGlyph(g: FontGlyph, u: number, v: number, filt: Filter): number {
  if (filt === 'nearest') return covAt(g, Math.floor(u - g.ox), Math.floor(v + g.oy))
  const fi = u - g.ox - 0.5
  const fj = v + g.oy - 0.5
  const i0 = Math.floor(fi)
  const j0 = Math.floor(fj)
  const ti = fi - i0
  const tj = fj - j0
  return covAt(g, i0, j0) * (1 - ti) * (1 - tj) + covAt(g, i0 + 1, j0) * ti * (1 - tj) + covAt(g, i0, j0 + 1) * (1 - ti) * tj + covAt(g, i0 + 1, j0 + 1) * ti * tj
}

function phase(g: FontGlyph, s: number, q: { fx: number; fy: number; rowsAbove: number; nrows: number }, filt: Filter): Phase {
  const { fx, fy, rowsAbove, nrows } = q
  const c0 = Math.ceil(fx - 0.5)
  const ncols = Math.max(0, Math.ceil(fx + s * g.adv - 0.5) - c0)
  const d = new Float32Array(ncols * nrows)
  let st = 0
  let st2 = 0
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const t = sampleGlyph(g, (c0 + c + 0.5 - fx) / s, (r - rowsAbove + 0.5 - fy) / s, filt)
      d[r * ncols + c] = t
      st += t
      st2 += t * t
    }
  }
  return { c0, ncols, d, st, st2 }
}

/** The glyphs at scale s, at every sub-pixel phase of the pen and the baseline. */
export function buildTemplates(atlas: FontAtlas, s: number, chars: readonly string[], filt: Filter): Templates {
  const rowsAbove = Math.ceil(s * atlas.ascent) + 1
  const nrows = rowsAbove + Math.ceil(s * (atlas.descent + 0.5)) + 1
  const T = chars.map((ch) => {
    const g = atlas.glyphs[ch]
    const per: Phase[] = []
    for (let qx = 0; qx < Q; qx++) for (let qy = 0; qy < Q; qy++) per.push(phase(g, s, { fx: qx / Q, fy: qy / Q, rowsAbove, nrows }, filt))
    return { ch, adv: g.adv, per }
  })
  return { s, T, rowsAbove, nrows }
}

/** Where a cell is decoded: xa..xb its ink, yb the baseline (fractional), x0 the pen's start. */
export interface Span {
  xa: number
  xb: number
  yb: number
  x0: number
}

export interface Decoded {
  text: string
  glyphs: { ch: string; p: number }[]
  cost: number
  /** Native pen positions covered. */
  P: number
  /** The window's variance: cost / varTot is the cell's fit, 0 exact. */
  varTot: number
}

/** The window's pixels, row by column, with per-column sums and an ink prefix count. */
interface Window {
  cx0: number
  ncol: number
  O: Float32Array
  colS: Float64Array
  colS2: Float64Array
  inkPre: Int32Array
}

function windowOf(L: Layout, tpl: Templates, rowTop: number, cols: [number, number]): Window {
  const { nrows } = tpl
  const [cx0, cx1] = cols
  const ncol = cx1 - cx0
  const colS = new Float64Array(ncol)
  const colS2 = new Float64Array(ncol)
  const colInk = new Int32Array(ncol)
  const O = new Float32Array(ncol * nrows)
  for (let c = 0; c < ncol; c++) {
    const X = cx0 + c
    for (let r = 0; r < nrows; r++) {
      const Y = rowTop + r
      const inside = X >= 0 && Y >= 0 && X < L.w && Y < L.h
      const o = inside ? L.v[Y * L.w + X] : 0
      O[r * ncol + c] = o
      colS[c] += o
      colS2[c] += o * o
      if (inside && L.ink[Y * L.w + X]) colInk[c]++
    }
  }
  const inkPre = new Int32Array(ncol + 1)
  for (let c = 0; c < ncol; c++) inkPre[c + 1] = inkPre[c] + colInk[c]
  return { cx0, ncol, O, colS, colS2, inkPre }
}

/** Each glyph's fitted brightness is bounded by the cell's own peak over its background. */
function brightness(win: Window, nrows: number, xa: number, xb: number): { kmin: number; kmax: number } {
  let peak = 0
  let low = 255
  const end = Math.min(win.ncol, Math.ceil(xb) - win.cx0 + 1)
  for (let c = Math.max(0, Math.floor(xa) - win.cx0); c < end; c++) {
    for (let r = 0; r < nrows; r++) {
      const o = win.O[r * win.ncol + c]
      peak = Math.max(peak, o)
      low = Math.min(low, o)
    }
  }
  return { kmin: 0.45 * (peak - low), kmax: 1.4 * (peak - low) + 10 }
}

/** The squared error of one glyph phase at column c0, background and brightness fitted. */
function glyphError(win: Window, tp: Phase, c0: number, k: { kmin: number; kmax: number; nrows: number }): number {
  let so = 0
  let so2 = 0
  for (let c = 0; c < tp.ncols; c++) {
    so += win.colS[c0 + c]
    so2 += win.colS2[c0 + c]
  }
  const n = tp.ncols * k.nrows
  let sot = 0
  const nc = tp.ncols
  for (let r = 0; r < k.nrows; r++) {
    const ro = r * win.ncol + c0
    const rd = r * nc
    for (let c = 0; c < nc; c++) sot += win.O[ro + c] * tp.d[rd + c]
  }
  let kk = 0
  const den = n * tp.st2 - tp.st * tp.st
  if (den > 1e-9) kk = (n * sot - tp.st * so) / den
  if (tp.st > 0) kk = Math.min(k.kmax, Math.max(k.kmin, kk))
  const b = (so - kk * tp.st) / n
  return so2 - 2 * b * so - 2 * kk * sot + n * b * b + 2 * b * kk * tp.st + kk * kk * tp.st2
}

/** Native pen positions as output columns: the pen's floor and its sub-pixel phase. */
const columnOf = (x0: number, s: number, p: number): { base: number; q: number } => {
  const xp = x0 + s * p
  const f = Math.floor(xp)
  const q = Math.round((xp - f) * Q)
  return q === Q ? { base: f + 1, q: 0 } : { base: f, q }
}

/** The cost of leaving one native pixel blank: its output columns are background. */
function skipError(win: Window, nrows: number, from: { base: number; q: number }, to: { base: number; q: number }): number {
  const ca = from.base + Math.ceil(from.q / Q - 0.5) - win.cx0
  const cb = to.base + Math.ceil(to.q / Q - 0.5) - win.cx0
  let sse = 0
  for (let c = ca; c < cb; c++) if (c >= 0 && c < win.ncol) sse += win.colS2[c] - (win.colS[c] * win.colS[c]) / nrows
  return sse
}

/** Glyphs and skips from the trace: a skip run of 2+ native px is a space, 9+ a column gap. */
function textOf(out: (string | null)[]): string {
  let text = ''
  let run = 0
  let started = false
  for (const ch of out) {
    if (ch === null) {
      run++
      continue
    }
    if (started && run >= 2) text += run >= 9 ? '   ' : ' '
    text += ch
    run = 0
    started = true
  }
  return text
}

function trace(back: Int32Array, T: readonly Template[], P: number): { text: string; glyphs: { ch: string; p: number }[] } {
  let p = P
  const out: (string | null)[] = []
  const glyphs: { ch: string; p: number }[] = []
  while (p > 0) {
    const b = back[p]
    if (b === -1) {
      out.push(null)
      p -= 1
    } else if (b >= 0) {
      p -= T[b].adv
      out.push(T[b].ch)
      glyphs.push({ ch: T[b].ch, p })
    } else break
  }
  return { text: textOf(out.reverse()), glyphs: glyphs.reverse() }
}

/** Read one cell: the cheapest run of glyphs and blanks over it. */
export function decodeCell(L: Layout, tpl: Templates, span: Span): Decoded {
  const { s, T, rowsAbove, nrows } = tpl
  const { xa, xb, yb, x0 } = span
  const yFloor = Math.floor(yb)
  const qy = Math.min(Q - 1, Math.round((yb - yFloor) * Q))
  const P = Math.ceil((xb + 2 * s - x0) / s) + 1
  const win = windowOf(L, tpl, yFloor - rowsAbove, [Math.floor(x0) - 2, Math.ceil(x0 + s * (P + 14)) + 2])
  const k = { ...brightness(win, nrows, xa, xb), nrows }
  const D = new Float64Array(P + 1).fill(Infinity)
  const back = new Int32Array(P + 1).fill(-2)
  D[0] = 0
  for (let p = 0; p < P; p++) {
    if (D[p] === Infinity) continue
    const at = columnOf(x0, s, p)
    const skip = D[p] + skipError(win, nrows, at, columnOf(x0, s, p + 1))
    if (skip < D[p + 1]) {
      D[p + 1] = skip
      back[p + 1] = -1
    }
    for (let gi = 0; gi < T.length; gi++) {
      const np = p + T[gi].adv
      const tp = T[gi].per[at.q * Q + qy]
      const c0 = at.base + tp.c0 - win.cx0
      // Off the window, or a glyph with ink over columns that have none.
      if (np > P || c0 < 0 || c0 + tp.ncols > win.ncol || (tp.st > 0 && win.inkPre[c0 + tp.ncols] - win.inkPre[c0] === 0)) continue
      const cost = D[p] + glyphError(win, tp, c0, k)
      if (cost < D[np]) {
        D[np] = cost
        back[np] = gi
      }
    }
  }
  return { ...trace(back, T, P), cost: D[P], P, varTot: variance(win, nrows, x0, x0 + s * P) }
}

function variance(win: Window, nrows: number, from: number, to: number): number {
  let tot = 0
  let tot2 = 0
  let nn = 0
  const end = Math.min(win.ncol, Math.ceil(to) - win.cx0)
  for (let c = Math.max(0, Math.floor(from) - win.cx0); c < end; c++) {
    tot += win.colS[c]
    tot2 += win.colS2[c]
    nn += nrows
  }
  return Math.max(1, tot2 - (tot * tot) / nn)
}

/** The baseline under a cell: the most common bottom of its columns (descenders are few). */
export function cellBaseline(L: Layout, cell: Pick<Cell, 'x0' | 'x1'>, line: Line, s: number): number {
  const hist = new Map<number, number>()
  for (let x = cell.x0; x <= cell.x1; x++) {
    let yb = -1
    for (let y = line.y1; y >= line.y0; y--) {
      if (L.textInk[y * L.w + x]) {
        yb = y
        break
      }
    }
    if (yb >= 0) hist.set(yb, (hist.get(yb) ?? 0) + 1)
  }
  let best = line.y1
  let bc = -1
  for (const [y, c] of hist) {
    if (c > bc || (c === bc && y < best)) {
      bc = c
      best = y
    }
  }
  return best + 1 - (s > 1 ? (s - 1) * 0.5 : 0)
}
