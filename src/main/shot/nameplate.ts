// nameplate.ts — whether a mob picture shows the mob's nameplate (owner, 2026-10-21). Electron-free,
// so it runs under node:test. A nameplate is bright text over a busy scene: OCR of the picture as it
// stands read only noise on the owner's lizardman scout, and read the name at once with everything
// but the near-white pixels blanked. So the picture is read as it is, then as near-white text, then as
// any bright text, then as mid-grey text, then with each of the picture's main colours as the text
// fill (the con colour can be any of seven), stopping at the first that names the mob.

import { nameInLines, subtitleInLines } from '../../shared/mobPicture'
import { readLines } from './ocr'
import type { Rgba } from './pixels'

type Keep = (r: number, g: number, b: number) => boolean

/** Near white: every channel bright, little colour. */
const WHITE: Keep = (r, g, b) => Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 40
/** Any bright text, a tinted nameplate. */
const BRIGHT: Keep = (r, g, b) => Math.max(r, g, b) >= 220
/** Mid grey, little colour: a grey-con nameplate (the owner's white wolf over snow, 2026-10-22). */
const GREY: Keep = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) <= 18 && Math.min(r, g, b) >= 90 && Math.max(r, g, b) <= 190

/** One channel well above the other two: a green, red or blue con's letters. */
const leads = (c: 0 | 1 | 2): Keep => (...rgb) => rgb[c] >= 110 && rgb[c] - Math.max(...rgb.filter((_, i) => i !== c)) >= 70
/**
 * The con colours' fills, read for a subtitle when the reading that named the mob held none (owner's
 * Raul, 2026-10-23: a green nameplate whose name the plain picture read as `LT Raul rs b` and its
 * `(Tailoring Supplies)` as junk; a green-led mask read both whole). Light blue and yellow lead on two.
 */
const CON_FILLS: readonly Keep[] = [leads(1), leads(0), leads(2), (r, g, b) => Math.min(g, b) >= 150 && r <= 100, (r, g, b) => Math.min(r, g) >= 160 && b <= 90]

/** The kept pixels black on white, as OCR reads best. */
export function textMask(img: Rgba, keep: Keep): Rgba {
  const data = new Uint8Array(img.w * img.h * 4).fill(255)
  for (let i = 0; i < img.w * img.h; i++) {
    if (keep(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2])) data.fill(0, i * 4, i * 4 + 3)
  }
  return { w: img.w, h: img.h, data }
}

/**
 * The picture's most common colours, quantised to 16 levels a channel. A nameplate's colour is the
 * con colour, set by the mob's level against the player's (owner, 2026-10-22: "you shouldn't assume
 * the color"), and its letters are one solid fill, so one of these is the fill whatever it is.
 */
export function mainColours(img: Rgba, n: number): Rgb[] {
  const count = new Map<number, number>()
  for (let i = 0; i < img.w * img.h; i++) {
    const key = ((img.data[i * 4] >> 4) << 8) | ((img.data[i * 4 + 1] >> 4) << 4) | (img.data[i * 4 + 2] >> 4)
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const mid = (q: number): number => q * 16 + 8
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => [mid((k >> 8) & 15), mid((k >> 4) & 15), mid(k & 15)])
}

type Rgb = readonly [number, number, number]
const nearColour = ([r0, g0, b0]: Rgb): Keep => (r, g, b) => Math.abs(r - r0) <= 36 && Math.abs(g - g0) <= 36 && Math.abs(b - b0) <= 36

/** How long the check may read before it gives up (it runs after the save, off the player's path). */
const BUDGET_MS = 15_000
const COLOURS = 8

/**
 * Whether the picture shows the mob's name: the picture as it is, then the fixed masks (near white,
 * bright, mid grey), then each of the picture's main colours as the text fill, stopping at the first
 * reading that names the mob or when the budget runs out. Measured 2026-10-22 on the owner's two
 * pictures and the wolf's name recoloured red, yellow, white, blue, light blue and green: all found,
 * and no reading named a mob that was not there.
 */
export async function showsName(img: Rgba, name: string): Promise<boolean> {
  return (await readNameplate(img, name)).shown
}

/** What a nameplate check read: whether the name shows, and the role printed under it, if any. */
export interface NameplateReading {
  shown: boolean
  /** `Tailoring Supplies` from `(Tailoring Supplies)` under the name (shared/mobPicture.ts `subtitleInLines`). */
  subtitle?: string
}

/**
 * `showsName`, with the subtitle under the name (owner, 2026-10-23: a merchant's nameplate says its
 * trade, for its page's description). Read off the reading that named the mob: the subtitle is the
 * name's own colour and size, so the view that reads one reads the other.
 */
export async function readNameplate(img: Rgba, name: string, wantSubtitle = false): Promise<NameplateReading> {
  const until = Date.now() + BUDGET_MS
  const fixed = [(): Rgba => img, (): Rgba => textMask(img, WHITE), (): Rgba => textMask(img, BRIGHT), (): Rgba => textMask(img, GREY)]
  const byColour = mainColours(img, COLOURS).map((c) => (): Rgba => textMask(img, nearColour(c)))
  for (const view of [...fixed, ...byColour]) {
    if (Date.now() > until) return { shown: false }
    const lines = (await readLines(view())).map((l) => l.text)
    if (!nameInLines(name, lines)) continue
    const subtitle = subtitleInLines(name, lines) ?? (wantSubtitle ? await subtitleByFill(img, name, until) : undefined)
    return subtitle === undefined ? { shown: true } : { shown: true, subtitle }
  }
  return { shown: false }
}

/** The subtitle from the con colours' fills, the first reading that names the mob and holds one. */
async function subtitleByFill(img: Rgba, name: string, until: number): Promise<string | undefined> {
  for (const fill of CON_FILLS) {
    if (Date.now() > until) return undefined
    const subtitle = subtitleInLines(name, (await readLines(textMask(img, fill))).map((l) => l.text))
    if (subtitle !== undefined) return subtitle
  }
  return undefined
}
