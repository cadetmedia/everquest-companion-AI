// gameTextures.ts — the game's own UI textures, read from the player's install, never shipped
// (plans/2026-10-20-screenshot-to-wiki.md; the same footing as spells_us.txt in gapSpellFacts.ts).
//
// Item icons: `uifiles/default/dragitem<N>.dds`, 256x256, a 6x6 grid of 40 px cells. The grid is
// column-major (`Vertical=true` in EQUI_DragItems.xml), so icon id = 500 + (N-1)*36 + col*6 + row:
// the wiki's `lucy_img_ID` (measured 2026-10-20 against items.json, by eye). Most sheets are DXT5;
// measured exceptions: DXT3 (sheet 323) and uncompressed A8R8G8B8 (sheets 9 and 302).
// Window backgrounds (`wnd_bg_dark_rock.tga`) are TGA.
//
// ELECTRON-FREE: buffers in, pixels out.

import type { Rgba } from './pixels'

export const ICON_CELL = 40
export const ICON_GRID = 6
export const ICON_BASE_ID = 500
const PER_SHEET = ICON_GRID * ICON_GRID

export function iconIdOf(sheet: number, col: number, row: number): number {
  return ICON_BASE_ID + (sheet - 1) * PER_SHEET + col * ICON_GRID + row
}

export function cellOf(id: number): { sheet: number; col: number; row: number } {
  const k = id - ICON_BASE_ID
  const idx = k % PER_SHEET
  return { sheet: Math.floor(k / PER_SHEET) + 1, col: Math.floor(idx / ICON_GRID), row: idx % ICON_GRID }
}

/** RGB565 -> [r, g, b]. */
function c565(v: number): [number, number, number] {
  return [(((v >> 11) & 31) * 255) / 31, (((v >> 5) & 63) * 255) / 63, ((v & 31) * 255) / 31]
}

/** The four colours of a DXT colour block; DXT1's 3-colour mode when c0 <= c1 and the block allows it. */
function blockColours(v0: number, v1: number, oneBitAlpha: boolean): [number, number, number, number][] {
  const k0 = c565(v0)
  const k1 = c565(v1)
  const mix = (a: number, b: number, d: number): [number, number, number, number] => [(a * k0[0] + b * k1[0]) / d, (a * k0[1] + b * k1[1]) / d, (a * k0[2] + b * k1[2]) / d, 255]
  if (oneBitAlpha && v0 <= v1) return [[...k0, 255], [...k1, 255], mix(1, 1, 2), [0, 0, 0, 0]]
  return [[...k0, 255], [...k1, 255], mix(2, 1, 3), mix(1, 2, 3)]
}

/** DXT5's eight alpha levels. */
function alphaLevels(a0: number, a1: number): number[] {
  const al = [a0, a1]
  if (a0 > a1) for (let i = 1; i < 7; i++) al.push(((7 - i) * a0 + i * a1) / 7)
  else {
    for (let i = 1; i < 5; i++) al.push(((5 - i) * a0 + i * a1) / 5)
    al.push(0, 255)
  }
  return al
}

/** One 4x4 block's alpha, by pixel: DXT3 explicit nibbles, DXT5 interpolated, DXT1 from the colours. */
function blockAlpha(buf: Uint8Array, o: number, format: 'DXT1' | 'DXT3' | 'DXT5'): number[] | null {
  if (format === 'DXT1') return null
  if (format === 'DXT3') return Array.from({ length: 16 }, (_, i) => ((buf[o + (i >> 1)] >> (4 * (i & 1))) & 15) * 17)
  const al = alphaLevels(buf[o], buf[o + 1])
  // 48 bits of 3-bit indices, read as two 24-bit halves (no BigInt in the hot loop).
  const lo = buf[o + 2] | (buf[o + 3] << 8) | (buf[o + 4] << 16)
  const hi = buf[o + 5] | (buf[o + 6] << 8) | (buf[o + 7] << 16)
  return Array.from({ length: 16 }, (_, i) => al[i < 8 ? (lo >> (3 * i)) & 7 : (hi >> (3 * (i - 8))) & 7])
}

function decodeBlocks(buf: Uint8Array, w: number, h: number, format: 'DXT1' | 'DXT3' | 'DXT5'): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  const step = format === 'DXT1' ? 8 : 16
  let o = 0
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4, o += step) {
      const alpha = blockAlpha(buf, o, format)
      const c = o + step - 8
      const cols = blockColours(buf[c] | (buf[c + 1] << 8), buf[c + 2] | (buf[c + 3] << 8), format === 'DXT1')
      const bits = (buf[c + 4] | (buf[c + 5] << 8) | (buf[c + 6] << 16) | (buf[c + 7] << 24)) >>> 0
      for (let i = 0; i < 16; i++) {
        const col = cols[(bits >>> (2 * i)) & 3]
        const p = ((by + (i >> 2)) * w + bx + (i & 3)) * 4
        out.set([col[0], col[1], col[2], alpha === null ? col[3] : alpha[i]], p)
      }
    }
  }
  return out
}

/** A DDS file -> RGBA; null for a format this reader does not know. */
export function decodeDds(file: Uint8Array): Rgba | null {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength)
  if (file.length < 128 || String.fromCharCode(...file.subarray(0, 4)) !== 'DDS ') return null
  const h = v.getUint32(12, true)
  const w = v.getUint32(16, true)
  const fourcc = String.fromCharCode(...file.subarray(84, 88))
  const body = file.subarray(128)
  if (fourcc === 'DXT1' || fourcc === 'DXT3' || fourcc === 'DXT5') return { w, h, data: decodeBlocks(body, w, h, fourcc) }
  // Uncompressed A8R8G8B8: 32 bits a pixel, red mask 0xff0000.
  if (v.getUint32(88, true) !== 32 || v.getUint32(92, true) !== 0xff0000 || body.length < w * h * 4) return null
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([body[i * 4 + 2], body[i * 4 + 1], body[i * 4], body[i * 4 + 3]], i * 4)
  return { w, h, data }
}

/** Raw or RLE pixels of a TGA body, as stored (BGR[A], bottom-up unless the header says top-down). */
function tgaPixels(file: Uint8Array, start: number, at: { n: number; bpp: number; rle: boolean }): Uint8Array {
  const { n, bpp, rle } = at
  const raw = new Uint8Array(n * bpp)
  if (!rle) {
    raw.set(file.subarray(start, start + raw.length))
    return raw
  }
  let o = start
  for (let i = 0; i < raw.length && o < file.length; ) {
    const head = file[o++]
    const count = (head & 127) + 1
    if (head & 128) {
      for (let k = 0; k < count; k++) raw.set(file.subarray(o, o + bpp), i + k * bpp)
      o += bpp
    } else {
      raw.set(file.subarray(o, o + count * bpp), i)
      o += count * bpp
    }
    i += count * bpp
  }
  return raw
}

/** A 24- or 32-bit true-colour TGA (raw or RLE) -> RGBA; null otherwise. */
export function decodeTga(file: Uint8Array): Rgba | null {
  if (file.length < 18) return null
  const type = file[2]
  const w = file[12] | (file[13] << 8)
  const h = file[14] | (file[15] << 8)
  const bpp = file[16] / 8
  if ((type !== 2 && type !== 10) || (bpp !== 3 && bpp !== 4)) return null
  const raw = tgaPixels(file, 18 + file[0], { n: w * h, bpp, rle: type === 10 })
  const topDown = (file[17] & 0x20) !== 0
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((topDown ? y : h - 1 - y) * w + x) * bpp
      data.set([raw[s + 2], raw[s + 1], raw[s], bpp === 4 ? raw[s + 3] : 255], (y * w + x) * 4)
    }
  }
  return { w, h, data }
}

/** One 40x40 cell of a sheet, RGBA. */
export function cutCell(sheet: Rgba, col: number, row: number): Uint8Array {
  const out = new Uint8Array(ICON_CELL * ICON_CELL * 4)
  for (let y = 0; y < ICON_CELL; y++) {
    const s = ((row * ICON_CELL + y) * sheet.w + col * ICON_CELL) * 4
    out.set(sheet.data.subarray(s, s + ICON_CELL * 4), y * ICON_CELL * 4)
  }
  return out
}
