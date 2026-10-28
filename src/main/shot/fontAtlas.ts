// fontAtlas.ts — the game's item-window font, drawn on this machine: Arial at 12 px, ClearType, the
// blue channel (font reader proof of concept, owner 2026-10-21: 0 wrong of 1,903 characters on the
// fixtures, plans/2026-10-20-screenshot-to-wiki.md). EverQuest draws its text with the player's own
// GDI Arial, so the player's own GDI renders the same glyphs; nothing derived from a font is shipped.
//
// gdi32 through koffi (the app's FFI, presenceNative.ts; every call declared once in `loadGdi`),
// loaded on the first read only and only to draw: a memory DC, the font, one bitmap. All 95
// printable glyphs are drawn into that bitmap and read back with one GetDIBits. No PowerShell
// (processSample.ts: forbidden). Windows only; null elsewhere or when GDI will not answer, and the
// reader then stays on OCR alone.

import type { IKoffiLib } from 'koffi'

export interface FontGlyph {
  ch: string
  /** The pen's advance, in native pixels. */
  adv: number
  w: number
  h: number
  /** The black box's left edge from the pen. */
  ox: number
  /** The black box's top above the baseline. */
  oy: number
  /** Coverage 0..1, `w * h`, row-major. */
  cov: Float32Array
}

export interface FontAtlas {
  ascent: number
  descent: number
  glyphs: Record<string, FontGlyph>
}

/** The item window's text at UI scale 1 (measured on the owner's Ruined Robe, 16 px line pitch). */
const HEIGHT = 12
const CLEARTYPE_QUALITY = 5
/** One cell per glyph: room for any 12 px glyph and its overhang. */
const CELL_W = 4 * HEIGHT + 16
const CELL_H = 3 * HEIGHT + 16
const COLS = 16
const FIRST = 32
const LAST = 126
const TA_BASELINE = 24
const TRANSPARENT = 1
/** Where the pen and baseline sit in each cell. */
const PEN_X = 8
const BASE_Y = 2 * HEIGHT + 4

/** The cut of one glyph from the drawn sheet: its box where the blue channel has ink. */
export function cutGlyph(blue: (x: number, y: number) => number, ch: string, adv: number): FontGlyph {
  let x0 = CELL_W
  let y0 = CELL_H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      if (blue(x, y) === 0) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  if (x1 < 0) return { ch, adv, w: 0, h: 0, ox: 0, oy: 0, cov: new Float32Array(0) }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const cov = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cov[y * w + x] = blue(x0 + x, y0 + y) / 255
  return { ch, adv, w, h, ox: x0 - PEN_X, oy: BASE_Y - y0, cov }
}

type Fn = (...args: unknown[]) => unknown

interface Gdi {
  call: (name: string, ...args: unknown[]) => unknown
}

function loadGdi(): Gdi {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi') as { load(name: string): IKoffiLib }
  const gdi32 = koffi.load('gdi32.dll')
  const fns: Record<string, Fn> = {}
  for (const p of [
    'void *__stdcall CreateCompatibleDC(void *dc)',
    'void *__stdcall CreateFontW(int h, int w, int esc, int ori, int weight, uint32 it, uint32 ul, uint32 so, uint32 cs, uint32 op, uint32 cp, uint32 q, uint32 pf, str16 face)',
    'void *__stdcall SelectObject(void *dc, void *obj)',
    'bool __stdcall DeleteObject(void *obj)',
    'bool __stdcall DeleteDC(void *dc)',
    'uint32 __stdcall SetTextColor(void *dc, uint32 c)',
    'int __stdcall SetBkMode(void *dc, int mode)',
    'uint32 __stdcall SetTextAlign(void *dc, uint32 align)',
    'bool __stdcall TextOutW(void *dc, int x, int y, str16 s, int n)',
    'bool __stdcall GetTextExtentPoint32W(void *dc, str16 s, int n, _Out_ void *size)',
    'bool __stdcall GetTextMetricsW(void *dc, _Out_ void *tm)',
    'void *__stdcall CreateDIBSection(void *dc, void *bmi, uint32 usage, _Out_ void *bits, void *section, uint32 offset)',
    'int __stdcall GetDIBits(void *dc, void *bmp, uint32 start, uint32 lines, _Out_ void *bits, void *bmi, uint32 usage)'
  ]) {
    const name = /(\w+)\(/.exec(p)?.[1] ?? ''
    fns[name] = gdi32.func(p) as Fn
  }
  return { call: (name, ...args) => fns[name](...args) }
}

/** A top-down 32-bit BITMAPINFO for a w x h sheet. */
function bitmapInfo(w: number, h: number): Buffer {
  const bmi = Buffer.alloc(44)
  bmi.writeInt32LE(40, 0)
  bmi.writeInt32LE(w, 4)
  bmi.writeInt32LE(-h, 8)
  bmi.writeInt16LE(1, 12)
  bmi.writeInt16LE(32, 14)
  return bmi
}

const CHARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => String.fromCharCode(FIRST + i))

/** Draw every glyph white on black into one sheet; the sheet's BGRA bytes and each glyph's advance. */
function drawSheet(g: Gdi, dc: unknown): { bgra: Buffer; adv: number[]; ascent: number; descent: number; w: number } {
  const w = COLS * CELL_W
  const h = Math.ceil(CHARS.length / COLS) * CELL_H
  const bmi = bitmapInfo(w, h)
  const bmp = g.call('CreateDIBSection', dc, bmi, 0, Buffer.alloc(8), null, 0)
  const old = g.call('SelectObject', dc, bmp)
  g.call('SetTextColor', dc, 0xffffff)
  g.call('SetBkMode', dc, TRANSPARENT)
  g.call('SetTextAlign', dc, TA_BASELINE)
  const tm = Buffer.alloc(64)
  g.call('GetTextMetricsW', dc, tm)
  const size = Buffer.alloc(8)
  const adv = CHARS.map((ch, i) => {
    g.call('GetTextExtentPoint32W', dc, ch, 1, size)
    g.call('TextOutW', dc, (i % COLS) * CELL_W + PEN_X, Math.floor(i / COLS) * CELL_H + BASE_Y, ch, 1)
    return size.readInt32LE(0)
  })
  // GetDIBits wants the bitmap out of the DC.
  g.call('SelectObject', dc, old)
  const bgra = Buffer.alloc(w * h * 4)
  const got = g.call('GetDIBits', dc, bmp, 0, h, bgra, bmi, 0)
  g.call('DeleteObject', bmp)
  if (got !== h) throw new Error('GetDIBits read no rows')
  return { bgra, adv, ascent: tm.readInt32LE(4), descent: tm.readInt32LE(8), w }
}

/** The atlas from this machine's GDI Arial; throws when GDI cannot draw it. */
function renderAtlas(): FontAtlas {
  const g = loadGdi()
  const dc = g.call('CreateCompatibleDC', null)
  const font = g.call('CreateFontW', -HEIGHT, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, CLEARTYPE_QUALITY, 0, 'Arial')
  try {
    g.call('SelectObject', dc, font)
    const sheet = drawSheet(g, dc)
    const glyphs: Record<string, FontGlyph> = {}
    CHARS.forEach((ch, i) => {
      const cx = (i % COLS) * CELL_W
      const cy = Math.floor(i / COLS) * CELL_H
      // BGRA: blue is byte 0 of each pixel.
      glyphs[ch] = cutGlyph((x, y) => sheet.bgra[((cy + y) * sheet.w + cx + x) * 4], ch, sheet.adv[i])
    })
    return { ascent: sheet.ascent, descent: sheet.descent, glyphs }
  } finally {
    g.call('DeleteObject', font)
    g.call('DeleteDC', dc)
  }
}

let atlas: FontAtlas | null | undefined

/** The atlas, drawn once per run; null off Windows or when GDI or Arial is missing. */
export function arialAtlas(): FontAtlas | null {
  if (atlas !== undefined) return atlas
  try {
    atlas = process.platform === 'win32' ? renderAtlas() : null
  } catch {
    atlas = null
  }
  return atlas
}
