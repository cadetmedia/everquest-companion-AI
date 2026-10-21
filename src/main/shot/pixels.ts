// pixels.ts — the few image operations the screenshot reader needs, on plain arrays: no image
// library, no Electron, so every step runs under node:test. Ported from the 2026-10-20 prototype
// (plans/2026-10-20-screenshot-to-wiki.md).

import { deflateSync } from 'node:zlib'

/** 8-bit RGBA, row-major. */
export interface Rgba {
  w: number
  h: number
  data: Uint8Array
}

/** Float RGB with alpha already applied over black, row-major. */
export interface Rgb {
  w: number
  h: number
  rgb: Float32Array
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function toRgb(img: Rgba): Rgb {
  const rgb = new Float32Array(img.w * img.h * 3)
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.data[i * 4 + 3] / 255
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = img.data[i * 4 + c] * a
  }
  return { w: img.w, h: img.h, rgb }
}

/** A box clipped to the image; null when nothing of it is inside. */
export function clipBox(b: Box, w: number, h: number): Box | null {
  const x0 = Math.max(0, Math.round(b.x))
  const y0 = Math.max(0, Math.round(b.y))
  const x1 = Math.min(w, Math.round(b.x + b.w))
  const y1 = Math.min(h, Math.round(b.y + b.h))
  return x1 - x0 < 4 || y1 - y0 < 4 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function cropRgba(img: Rgba, b: Box): Rgba {
  const data = new Uint8Array(b.w * b.h * 4)
  for (let r = 0; r < b.h; r++) data.set(img.data.subarray(((b.y + r) * img.w + b.x) * 4, ((b.y + r) * img.w + b.x + b.w) * 4), r * b.w * 4)
  return { w: b.w, h: b.h, data }
}

/** One output pixel of an area-averaging resample: the weighted mean of the source cells `cell` covers. */
function areaMean(src: { rgb: Float32Array; w: number }, cell: Box, out: Float32Array, d: number): void {
  const acc = [0, 0, 0, 0]
  for (let yy = Math.floor(cell.y); yy < Math.ceil(cell.y + cell.h); yy++) {
    const wy = Math.min(cell.y + cell.h, yy + 1) - Math.max(cell.y, yy)
    for (let xx = Math.floor(cell.x); xx < Math.ceil(cell.x + cell.w); xx++) {
      const wgt = (Math.min(cell.x + cell.w, xx + 1) - Math.max(cell.x, xx)) * wy
      const p = (yy * src.w + xx) * 3
      if (wgt <= 0 || p < 0 || p >= src.rgb.length) continue
      for (let c = 0; c < 3; c++) acc[c] += src.rgb[p + c] * wgt
      acc[3] += wgt
    }
  }
  for (let c = 0; c < 3; c++) out[d + c] = acc[3] > 0 ? acc[c] / acc[3] : 0
}

/** Area-averaging resize of the region `b` of an RGB buffer (`w` wide) to `size`; works both ways. */
export function resizeRgb(src: { rgb: Float32Array; w: number }, b: Box, size: { w: number; h: number }): Float32Array {
  const out = new Float32Array(size.w * size.h * 3)
  const fx = b.w / size.w
  const fy = b.h / size.h
  for (let y = 0; y < size.h; y++) {
    for (let x = 0; x < size.w; x++) areaMean(src, { x: b.x + x * fx, y: b.y + y * fy, w: fx, h: fy }, out, (y * size.w + x) * 3)
  }
  return out
}

/** The box of pixels brighter than T in any channel (near-black is background); null when none. */
export function contentBox(rgb: Float32Array, w: number, h: number, T = 48): Box | null {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3
      if (Math.max(rgb[p], rgb[p + 1], rgb[p + 2]) <= T) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/**
 * The picture OCR reads best (measured on the prototype's synthetic windows): scaled up `k` times
 * with bilinear smoothing, then each pixel's brightest channel inverted, so light text of any
 * colour on a dark window becomes dark text on light grey. No threshold: a hard one cost ~17 points.
 */
export function ocrGray(img: Rgba, k: number): { w: number; h: number; gray: Uint8Array } {
  const W = img.w * k
  const H = img.h * k
  const gray = new Uint8Array(W * H)
  const at = (x: number, y: number): number => {
    const p = (Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 4
    return Math.max(img.data[p], img.data[p + 1], img.data[p + 2])
  }
  for (let y = 0; y < H; y++) {
    const sy = (y + 0.5) / k - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) / k - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
      const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
      gray[y * W + x] = 255 - Math.round(top * (1 - fy) + bottom * fy)
    }
  }
  return { w: W, h: H, gray }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** An 8-bit grayscale picture as a PNG file (Node's zlib, no codec of ours): what tesseract.js decodes fastest. */
export function grayPng(w: number, h: number, gray: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 0, 0, 0, 0], 8)
  const raw = Buffer.alloc((w + 1) * h)
  for (let y = 0; y < h; y++) raw.set(gray.subarray(y * w, (y + 1) * w), y * (w + 1) + 1)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))])
}
