// shotPng — a PNG reader for the screenshot tests (tests/fixtures/shots): 8-bit RGB or RGBA,
// not interlaced, the five filters. The app decodes with Electron's nativeImage; tests run without it.

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import type { Rgba } from '../src/main/shot/pixels'

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function unfilter(raw: Buffer, w: number, h: number, bpp: number): Uint8Array {
  const stride = w * bpp
  const out = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]
      const a = i >= bpp ? out[y * stride + i - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]
      out[y * stride + i] = (x + pred) & 255
    }
  }
  return out
}

export function readPng(path: string): Rgba {
  const buf = readFileSync(path)
  let o = 8
  let w = 0
  let h = 0
  let type = 0
  const idat: Buffer[] = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o)
    const kind = buf.toString('latin1', o + 4, o + 8)
    const body = buf.subarray(o + 8, o + 8 + len)
    if (kind === 'IHDR') [w, h, type] = [body.readUInt32BE(0), body.readUInt32BE(4), body[9]]
    if (kind === 'IDAT') idat.push(body)
    o += 12 + len
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : type === 0 ? 1 : 0
  if (bpp === 0) throw new Error(`unsupported PNG colour type ${String(type)}`)
  const px = unfilter(inflateSync(Buffer.concat(idat)), w, h, bpp)
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp
    data.set(bpp === 1 ? [px[s], px[s], px[s], 255] : [px[s], px[s + 1], px[s + 2], bpp === 4 ? px[s + 3] : 255], i * 4)
  }
  return { w, h, data }
}
