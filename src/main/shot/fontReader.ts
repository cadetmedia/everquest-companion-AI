// fontReader.ts — the exact-match font reader (owner, 2026-10-21: "sure do it"): a game window's
// text read against the game's own glyphs (fontAtlas.ts), with each cell's fit, so the caller keeps
// only what matched exactly and OCR reads the rest (fontMerge.ts). The proof of concept read 0 wrong
// of 1,903 characters on the fixtures where tesseract read 42 wrong (every decimal, rn and III right);
// plans/2026-10-20-screenshot-to-wiki.md.
//
// Pure and synchronous (0.05-2.5 s a window), so the app runs it on a worker (fontReaderWorker.ts).
// ELECTRON-FREE.

import type { FontAtlas } from './fontAtlas'
import { buildTemplates, cellBaseline, decodeCell, type Filter, type Templates } from './fontDecode'
import { layout, type Layout } from './fontLayout'
import { fitOf, fitScale, refineScale, type CellAt, type ScaleFit } from './fontScale'
import type { Box, Rgba } from './pixels'

export interface FontCell {
  /** As decoded: `l` stands for both `I` and `l` (one bitmap in 12 px Arial; fontMerge.ts picks). */
  text: string
  /** Error over variance: about 0.002-0.017 where the font matched, 0.02+ on art and other fonts. */
  fit: number
  box: Box
}

export interface FontRead {
  /** 0 when no scale fits (another font, or a UI scale the font does not magnify cleanly). */
  scale: number
  filter: Filter
  cells: FontCell[]
  ms: number
}

/** A refined fit this good is the scale: the other candidate is not tried. */
const SETTLED = 0.01

/** The widest cells that look like text (letter-sized pieces), never a frame's ornament. */
function calibration(L: Layout): CellAt[] {
  const all = L.lines.flatMap((line) => line.cells.map((cell) => ({ line, cell })))
  const s0 = L.scale
  const texty = all.filter(({ cell, line }) => {
    const hs = cell.pieces.map((c) => c.h).sort((a, b) => a - b)
    const med = hs[hs.length >> 1]
    return cell.pieces.length >= 2 && med >= 6 * s0 && med <= 14 * s0 && line.y1 - line.y0 + 1 <= 18 * s0
  })
  return [...(texty.length > 0 ? texty : all)].sort((a, b) => b.cell.x1 - b.cell.x0 - (a.cell.x1 - a.cell.x0)).slice(0, 2)
}

type Judged = ScaleFit & { n: number }

/** One candidate refined, and also as it was, each filter tried: judged by the widest cell decoded whole. */
function judge(L: Layout, atlas: FontAtlas, chars: readonly string[], c: { cand: ScaleFit; at: CellAt }): Judged {
  const { cell } = c.at
  const r0 = refineScale(L, { atlas, chars }, c.cand, c.at)
  let best: Judged = { ...r0, n: Infinity }
  for (const r of [r0, { ...r0, s: c.cand.s }]) {
    for (const filt of r.s >= 1.2 ? (['bilinear', 'nearest'] as const) : (['bilinear'] as const)) {
      const n = fitOf(decodeCell(L, buildTemplates(atlas, r.s, chars, filt), { xa: cell.x0, xb: cell.x1, yb: r.yb, x0: r.x0 }))
      if (n < best.n) best = { s: r.s, filt, n }
    }
  }
  return best
}

/** The scale and filter; null when no candidate fits. */
function chooseScale(L: Layout, atlas: FontAtlas, chars: readonly string[], calib: readonly CellAt[]): ScaleFit | null {
  const cands = fitScale(L, atlas, chars, calib)
  if (cands.length === 1 && cands[0].s === 1) return cands[0]
  let fit: Judged | null = null
  for (const cand of cands) {
    const j = judge(L, atlas, chars, { cand, at: calib[0] })
    if (fit === null || j.n < fit.n) fit = j
    if (fit.n < SETTLED) break
  }
  return fit
}

interface Origin {
  n: number
  ox: number
  oy: number
}

/** The pen start and baseline that best fit a prefix of one cell. */
function originIn(L: Layout, tpl: Templates, { cell, line }: CellAt): Origin {
  const s = tpl.s
  const ybe = cellBaseline(L, cell, line, s)
  const xb = Math.min(cell.x1, cell.x0 + 40 * s)
  let best: Origin = { n: Infinity, ox: 0, oy: 0 }
  for (let dy = -0.75; dy <= 0.75; dy += 0.25) {
    for (let ph = 0; ph < 1; ph += 0.25) {
      const x0 = Math.floor(cell.x0 - 2 * s) + ph
      const n = fitOf(decodeCell(L, tpl, { xa: cell.x0, xb, yb: ybe + dy, x0 }))
      if (n < best.n) best = { n, ox: x0, oy: ybe + dy }
    }
  }
  return best
}

/** At a fractional scale, native positions land on a grid: its origin, from the calibration cells. */
function gridOrigin(L: Layout, tpl: Templates, calib: readonly CellAt[]): { ox: number; oy: number } {
  let best: Origin = { n: Infinity, ox: 0, oy: 0 }
  for (const c of calib) {
    const o = originIn(L, tpl, c)
    if (o.n < best.n) best = o
  }
  return best
}

const onGrid = (o: number, s: number, x: number): number => o + s * Math.round((x - o) / s)

/** Every cell decoded at its cheapest baseline. */
function readCells(L: Layout, tpl: Templates, grid: { ox: number; oy: number } | null): FontCell[] {
  const s = tpl.s
  const out: FontCell[] = []
  for (const line of L.lines) {
    const ybl = cellBaseline(L, { x0: line.cells[0].x0, x1: line.cells[line.cells.length - 1].x1 }, line, s)
    for (const cell of line.cells) {
      const ybe = cellBaseline(L, cell, line, s)
      const ybs = [...new Set([ybe, ybl].flatMap((e) => (grid !== null ? [-1, 0, 1].map((d) => +(onGrid(grid.oy, s, e) + d * s).toFixed(3)) : [e - 1, e, e + 1])))]
      const x0 = grid !== null ? onGrid(grid.ox, s, cell.x0 - 2 * s) : cell.x0 - 2
      const best = ybs.map((yb) => decodeCell(L, tpl, { xa: cell.x0, xb: cell.x1, yb, x0 })).reduce((a, b) => (b.cost < a.cost ? b : a))
      out.push({ text: best.text.trim(), fit: fitOf(best), box: { x: cell.x0, y: line.y0, w: cell.x1 - cell.x0 + 1, h: line.y1 - line.y0 + 1 } })
    }
  }
  return out
}

/** Every text cell of the picture, read against the atlas, with its fit. */
export function readFont(img: Rgba, atlas: FontAtlas): FontRead {
  const t0 = performance.now()
  const L = layout(img)
  // `I` and `l` are one bitmap: `l` stands for both.
  const chars = Object.keys(atlas.glyphs).filter((c) => c !== ' ' && c !== 'I')
  const calib = calibration(L)
  const fit = calib.length === 0 ? null : chooseScale(L, atlas, chars, calib)
  // Nothing in the font: no cells, and OCR reads the window alone.
  if (fit === null) return { scale: 0, filter: 'bilinear', cells: [], ms: Math.round(performance.now() - t0) }
  const s = Math.abs(fit.s - 1) < 0.004 ? 1 : fit.s
  const tpl = buildTemplates(atlas, s, chars, fit.filt)
  const grid = Math.abs(s - 1) > 0.001 ? gridOrigin(L, tpl, calib) : null
  return { scale: s, filter: fit.filt, cells: readCells(L, tpl, grid), ms: Math.round(performance.now() - t0) }
}
