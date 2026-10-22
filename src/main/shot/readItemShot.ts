// readItemShot.ts — one pasted screenshot of an item window -> the page's fields and the icon's id
// (owner ask, 2026-10-21: "paste an image directly into the details section ... as easy as possible").
//
// The text is read first (ocr.ts, itemWindow.ts). The icon is found where the window draws it: left of
// the text column, beside the name, at a size that follows the text's line pitch (the owner's 1:1 UI
// and Malkil's larger one both). A picture small enough to be the icon alone skips the text.
// Each way of removing the background is tried (background.ts) and the clearest winner kept.
//
// ELECTRON-FREE: the caller hands in the pixels and the install's readers.

import { readItemWindow, type ItemWindowRead } from '../../shared/itemWindow'
import { asIs, fitTexture, flatRemoved, textureRemoved } from './background'
import { findIcon, margin, type IconHit } from './iconMatch'
import type { IconIndex } from './iconIndex'
import { readLines, type OcrLine } from './ocr'
import { clipBox, type Box, type Rgb, type Rgba } from './pixels'

export interface ShotReaders {
  /** The install's icon index, or null when the install has no icon sheets. */
  index: () => Promise<IconIndex | null>
  /** An icon's 40x40 RGBA. */
  cell: (id: number) => Uint8Array | null
  /** The skins' window background textures, for opaque windows. */
  textures: () => Rgba[]
  /** The catalog's item names within OCR's slips of a name read (itemShotKeep.ts `sameItem`). */
  known?: (name: string) => string[]
}

export interface ItemShot {
  read: ItemWindowRead
  /** The OCR lines as read, for the player to check against. */
  lines: string[]
  /** Best first; empty when no icon could be looked for. */
  icons: IconHit[]
  /** How clearly the first icon wins (runner-up over winner). */
  iconMargin: number
  /** The catalog's names near the name read (`ShotReaders.known`). */
  known: string[]
  ms: number
}

/** A picture this small is the icon alone (an inventory slot, the wiki-style paste). */
const ICON_ONLY_MAX = 160
/** A texture fit worse than this is not the window's background. */
const TEXTURE_RMS_MAX = 6

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1]

/**
 * Where the icon is: the window draws it left of the text column (`IDW_IconButton`), its top at the
 * name line, two lines above `Class:`; its side about 2.5 line pitches (40 px at the owner's 16 px).
 */
export function iconRegion(lines: readonly OcrLine[], w: number, h: number): Box | null {
  const cls = lines.findIndex((l) => /\bClass\b/i.test(l.text))
  if (cls < 0) return null
  const race = lines.findIndex((l, i) => i > cls && /\bRace\b/i.test(l.text))
  const at = lines[cls].lead
  const pitch = race > cls ? lines[race].lead.y - at.y : at.h * 1.4
  // The text column's left edge: the `Class:` and `Race:` words themselves (a junk prefix such as
  // `| Class` stretches the line's box over the icon, never the word's).
  const left = median([at.x, ...(race > cls ? [lines[race].lead.x] : [])])
  const side = 3.4 * pitch
  return clipBox({ x: left - side - 0.15 * pitch, y: at.y - 2.5 * pitch, w: side, h: side }, w, h)
}

/** A winner this clear needs no further try (the prototype's clear wins ran 3 to 15). */
const CLEAR = 3

/** The texture-removed views, one per skin texture that explains the region's edge. */
function textureViews(img: Rgba, b: Box, textures: readonly Rgba[]): Rgb[] {
  return textures.flatMap((tex) => {
    const fit = fitTexture(img, b, tex)
    return fit.rms <= TEXTURE_RMS_MAX ? [textureRemoved(img, b, { tex, fit })] : []
  })
}

async function iconsIn(img: Rgba, b: Box | null, r: ShotReaders): Promise<IconHit[]> {
  const index = b === null ? null : await r.index()
  if (index === null || b === null) return []
  let best: IconHit[] = []
  // The view whose best icon fits closest wins (scores are per content pixel, so they compare across
  // views). By margin instead, a meaningless near-tie on the untouched sky (999 vs 1085) beat the flat
  // view's real answer (1104 at 435) on Malkil's sky shot.
  const tryView = (q: Rgb): void => {
    // 30 kept: the picker shows 5 and "Show more" adds 5 a click (owner, 2026-10-21).
    const hits = findIcon(q, index, r.cell, 30)
    if (hits.length > 0 && (best.length === 0 || hits[0].score < best[0].score)) best = hits
  }
  // Cheapest first: as it is, the flat background, then the skin's textures (the slow fit).
  for (const q of [asIs(img, b), flatRemoved(img, b)]) tryView(q)
  if (margin(best) < CLEAR) for (const q of textureViews(img, b, r.textures())) tryView(q)
  return best
}

export async function readItemShot(img: Rgba, r: ShotReaders): Promise<ItemShot> {
  const t0 = performance.now()
  const iconOnly = img.w <= ICON_ONLY_MAX && img.h <= ICON_ONLY_MAX
  const lines = iconOnly ? [] : await readLines(img)
  const region = iconOnly ? { x: 0, y: 0, w: img.w, h: img.h } : iconRegion(lines, img.w, img.h)
  const icons = await iconsIn(img, region, r)
  const read: ItemWindowRead = iconOnly ? { statsblock: '', unread: [] } : readItemWindow(lines.map((l) => l.text))
  return {
    read,
    lines: lines.map((l) => l.text),
    icons,
    iconMargin: margin(icons),
    known: read.name === undefined ? [] : (r.known?.(read.name) ?? []),
    ms: Math.round(performance.now() - t0)
  }
}
