// background.ts — take the window's background out from behind an icon, so the finder sees the icon
// over black (iconMatch.ts). Two ways, measured on real windows (plans/2026-10-20-screenshot-to-wiki.md):
//
//   flat:    a see-through window over the sky or the ground is close to one colour; the median of
//            the region's edge is that colour. Malkil's Windstriker, sky and ground: 2nd -> top pair.
//   texture: an opaque window draws the skin's own rock texture, tiled 1:1 (`wnd_bg_dark_rock.tga`,
//            fit 0.8 RMS). Aligned on the region's edge, subtracted. Black Lizard Scale: only this.
//
// The caller tries each (and none) and keeps the clearest winner.
//
// ELECTRON-FREE.

import type { Box, Rgb, Rgba } from './pixels'

/** The median colour of a region's outer ring. */
export function ringColour(img: Rgba, b: Box): [number, number, number] {
  const ch: number[][] = [[], [], []]
  const push = (x: number, y: number): void => {
    const p = ((b.y + y) * img.w + b.x + x) * 4
    for (let c = 0; c < 3; c++) ch[c].push(img.data[p + c])
  }
  for (let x = 0; x < b.w; x++) {
    push(x, 0)
    push(x, b.h - 1)
  }
  for (let y = 1; y < b.h - 1; y++) {
    push(0, y)
    push(b.w - 1, y)
  }
  const mid = (v: number[]): number => v.sort((a, z) => a - z)[v.length >> 1]
  return [mid(ch[0]), mid(ch[1]), mid(ch[2])]
}

/** The region with every pixel within `t` of its predicted background set to black. */
function blackOut(img: Rgba, b: Box, bgAt: (x: number, y: number) => readonly number[], t: number): Rgb {
  const rgb = new Float32Array(b.w * b.h * 3)
  const keep = (x: number, y: number): void => {
    const p = ((b.y + y) * img.w + b.x + x) * 4
    const bg = bgAt(b.x + x, b.y + y)
    if (Math.hypot(img.data[p] - bg[0], img.data[p + 1] - bg[1], img.data[p + 2] - bg[2]) <= t) return
    rgb.set([img.data[p], img.data[p + 1], img.data[p + 2]], (y * b.w + x) * 3)
  }
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) keep(x, y)
  return { w: b.w, h: b.h, rgb }
}

/** The region as it is, over black (no removal). */
export function asIs(img: Rgba, b: Box): Rgb {
  return blackOut(img, b, () => [-999, -999, -999], 0)
}

/** Flat background: the ring's median colour, pixels within 25 of it black (prototype: 20-30 best). */
export function flatRemoved(img: Rgba, b: Box, t = 25): Rgb {
  const bg = ringColour(img, b)
  return blackOut(img, b, () => bg, t)
}

// ---- the skin's tiled texture -------------------------------------------------------------------

export interface TextureFit {
  dx: number
  dy: number
  /** Root mean square of the green channel's error on the samples (0.8-0.9 on the owner's windows). */
  rms: number
}

/** Edge pixels of the region, a few rows deep: background in every window measured. */
function edgeSamples(img: Rgba, b: Box, depth = 3): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const edge = x < depth || y < depth || x >= b.w - depth || y >= b.h - depth
      if (edge) out.push([b.x + x, b.y + y, img.data[((b.y + y) * img.w + b.x + x) * 4 + 1]])
    }
  }
  return out
}

const texG = (tex: Rgba, x: number, y: number): number => tex.data[((((y % tex.h) + tex.h) % tex.h) * tex.w + (((x % tex.w) + tex.w) % tex.w)) * 4 + 1]

/** Squared error of one offset, stopping once it passes `cap`. */
function offsetError(tex: Rgba, samples: readonly [number, number, number][], o: { dx: number; dy: number }, cap: number): number {
  let e = 0
  for (const [x, y, v] of samples) {
    const d = v - texG(tex, x + o.dx, y + o.dy)
    e += d * d
    if (e > cap) break
  }
  return e
}

/** Offsets scored on a few spread samples first; this many go on to the full set. */
const SHORTLIST = 64
const PROBES = 24

/** The `SHORTLIST` offsets that best explain a few spread edge samples. */
function shortlist(tex: Rgba, probes: readonly [number, number, number][]): { dx: number; dy: number }[] {
  const keep: { dx: number; dy: number; e: number }[] = []
  let worst = Infinity
  for (let dy = 0; dy < tex.h; dy++) {
    for (let dx = 0; dx < tex.w; dx++) {
      const e = offsetError(tex, probes, { dx, dy }, keep.length < SHORTLIST ? Infinity : worst)
      if (keep.length >= SHORTLIST && e >= worst) continue
      keep.push({ dx, dy, e })
      if (keep.length > SHORTLIST) keep.sort((a, z) => a.e - z.e).pop()
      worst = keep.length < SHORTLIST ? Infinity : Math.max(...keep.map((k) => k.e))
    }
  }
  return keep
}

/** The tiling offset where the texture best explains the region's edge: a shortlist, then every sample. */
export function fitTexture(img: Rgba, b: Box, tex: Rgba): TextureFit {
  const samples = edgeSamples(img, b)
  const step = Math.max(1, Math.floor(samples.length / PROBES))
  const probes = samples.filter((_, i) => i % step === 0)
  let best = { dx: 0, dy: 0, e: Infinity }
  for (const o of shortlist(tex, probes)) {
    const e = offsetError(tex, samples, o, best.e)
    if (e < best.e) best = { ...o, e }
  }
  return { dx: best.dx, dy: best.dy, rms: Math.sqrt(best.e / Math.max(1, samples.length)) }
}

/** Within this of the fitted texture is background (prototype: 0.8-0.9 RMS fits, 10 kept the icon whole). */
const TEXTURE_T = 10

/** The region with the fitted texture subtracted. */
export function textureRemoved(img: Rgba, b: Box, t: { tex: Rgba; fit: TextureFit }): Rgb {
  const { tex, fit } = t
  return blackOut(
    img,
    b,
    (x, y) => {
      const p = ((((y + fit.dy) % tex.h) + tex.h) % tex.h * tex.w + ((((x + fit.dx) % tex.w) + tex.w) % tex.w)) * 4
      return [tex.data[p], tex.data[p + 1], tex.data[p + 2]]
    },
    TEXTURE_T
  )
}
