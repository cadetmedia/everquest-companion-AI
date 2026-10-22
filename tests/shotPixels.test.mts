// The screenshot reader's picture code on synthetic data (src/main/shot): no game art is committed,
// so the sheets here are made up, in the formats the install uses (DXT1/DXT5 blocks, A8R8G8B8, TGA).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cellOf, decodeDds, decodeTga, iconIdOf } from '../src/main/shot/gameTextures.ts'
import { buildIconIndex, iconSheets, readIconIndex, sheetsFingerprint, SheetCells, writeIconIndex } from '../src/main/shot/iconIndex.ts'
import { findIcon } from '../src/main/shot/iconMatch.ts'
import { fitTexture, flatRemoved, textureRemoved } from '../src/main/shot/background.ts'
import { grayPng, ocrGray, toRgb, type Rgba } from '../src/main/shot/pixels.ts'
import { langPath, linesFromTsv, ocrScale } from '../src/main/shot/ocr.ts'
import { iconRegion } from '../src/main/shot/readItemShot.ts'
import { readPng } from './shotPng.mts'

function ddsHeader(w: number, h: number, fourcc: string | null): Buffer {
  const b = Buffer.alloc(128)
  b.write('DDS ', 0)
  b.writeUInt32LE(124, 4)
  b.writeUInt32LE(h, 12)
  b.writeUInt32LE(w, 16)
  if (fourcc === null) {
    b.writeUInt32LE(32, 88)
    b.writeUInt32LE(0xff0000, 92)
  } else b.write(fourcc, 84)
  return b
}

/** One cell's rectangle, its colour and size from `k`, stored BGRA. */
function paintCell(px: Buffer, col: number, row: number, k: number): void {
  const [r, g, b] = [(k * 53) % 256, (k * 97) % 256, (k * 31 + 64) % 256]
  const [w, h] = [10 + (k % 5) * 6, 10 + ((k >> 2) % 5) * 6]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([b, g, r, 255], ((row * 40 + 4 + y) * 256 + col * 40 + 4 + x) * 4)
}

/** A 256x256 A8R8G8B8 sheet: in each cell a rectangle whose colour and size depend on the cell. */
function syntheticSheet(seed: number): Buffer {
  const px = Buffer.alloc(256 * 256 * 4)
  for (let col = 0; col < 6; col++) for (let row = 0; row < 6; row++) paintCell(px, col, row, seed * 36 + col * 6 + row)
  return Buffer.concat([ddsHeader(256, 256, null), px])
}

test('THE ICON ID IS COLUMN-MAJOR FROM 500, 36 A SHEET (measured against items.json, 2026-10-20)', () => {
  assert.equal(iconIdOf(1, 0, 2), 502)
  assert.equal(iconIdOf(1, 1, 0), 506)
  assert.equal(iconIdOf(2, 0, 0), 536)
  for (const id of [500, 566, 1126, 1225, 14143]) {
    const c = cellOf(id)
    assert.equal(iconIdOf(c.sheet, c.col, c.row), id)
  }
})

test('DDS: A DXT1 BLOCK AND A DXT5 BLOCK DECODE TO THEIR COLOURS AND ALPHA; UNKNOWN FORMATS ARE NULL', () => {
  // DXT1: colour 0 pure red (565 0xF800), colour 1 pure blue (0x001F); pixel 0 index 0, pixel 1 index 1.
  const dxt1 = Buffer.concat([ddsHeader(4, 4, 'DXT1'), Buffer.from([0x00, 0xf8, 0x1f, 0x00, 0b0100, 0, 0, 0])])
  const a = decodeDds(dxt1)
  assert.deepEqual([...(a?.data.subarray(0, 8) ?? [])], [255, 0, 0, 255, 0, 0, 255, 255])
  // DXT5: alpha 255/0 with every alpha index 1 (all transparent); colour red.
  const dxt5 = Buffer.concat([ddsHeader(4, 4, 'DXT5'), Buffer.from([255, 0, 0x49, 0x92, 0x24, 0x49, 0x92, 0x24, 0x00, 0xf8, 0x1f, 0x00, 0, 0, 0, 0])])
  const b = decodeDds(dxt5)
  assert.deepEqual([...(b?.data.subarray(0, 4) ?? [])], [255, 0, 0, 0])
  assert.equal(decodeDds(Buffer.concat([ddsHeader(4, 4, 'ATI2'), Buffer.alloc(16)])), null)
})

test('TGA: A BOTTOM-UP 24-BIT PICTURE COMES OUT TOP-DOWN RGBA', () => {
  const head = Buffer.alloc(18)
  head[2] = 2
  head.writeUInt16LE(1, 12)
  head.writeUInt16LE(2, 14)
  head[16] = 24
  // bottom row first: blue (BGR 255,0,0), then the top row red (BGR 0,0,255)
  const t = decodeTga(Buffer.concat([head, Buffer.from([255, 0, 0, 0, 0, 255])]))
  assert.deepEqual([...(t?.data ?? [])], [255, 0, 0, 255, 0, 0, 255, 255])
})

test('THE INDEX: BUILT FROM THE SHEETS, CACHED, REFUSED WHEN THE SHEETS CHANGE; THE FINDER PICKS A SCALED, FRAMED ICON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eq-icons-'))
  try {
    writeFileSync(join(dir, 'dragitem1.dds'), syntheticSheet(0))
    writeFileSync(join(dir, 'dragitem2.dds'), syntheticSheet(1))
    const sheets = iconSheets(dir)
    assert.deepEqual(sheets.map((s) => s.n), [1, 2])
    const index = await buildIconIndex(sheets)
    assert.equal(index.n, 72)
    const fp = sheetsFingerprint(sheets)
    const cache = join(dir, 'index.bin')
    writeIconIndex(cache, fp, index)
    assert.deepEqual(readIconIndex(cache, fp)?.ids, index.ids)
    assert.equal(readIconIndex(cache, `${fp}x`), null)

    // The query: icon 545 (sheet 2, col 1, row 3) at 2x inside a 3 px grey slot frame.
    const cells = new SheetCells(dir)
    const cell = cells.cell(545)
    assert.ok(cell !== null)
    const W = 86
    const q: Rgba = { w: W, h: W, data: new Uint8Array(W * W * 4) }
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const frame = x < 3 || y < 3 || x >= W - 3 || y >= W - 3
        const s = ((Math.floor((y - 3) / 2) * 40 + Math.floor((x - 3) / 2)) * 4) | 0
        q.data.set(frame ? [120, 120, 120, 255] : [cell[s], cell[s + 1], cell[s + 2], 255], (y * W + x) * 4)
      }
    }
    const hits = findIcon(toRgb(q), index, (id) => cells.cell(id), 3)
    assert.equal(hits[0]?.id, 545)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A picture of `w` x `h`, every pixel from `at`. */
function picture(w: number, h: number, at: (x: number, y: number) => number[]): Rgba {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...at(x, y), 255], (y * w + x) * 4)
  return { w, h, data }
}

test('FLAT BACKGROUND: THE RING COLOUR GOES BLACK, THE ICON STAYS', () => {
  const img = picture(30, 30, (x, y) => (x > 10 && x < 20 && y > 10 && y < 20 ? [200, 180, 20] : [40, 60, 90]))
  const out = flatRemoved(img, { x: 0, y: 0, w: 30, h: 30 })
  assert.deepEqual([...out.rgb.subarray(0, 3)], [0, 0, 0])
  const mid = (15 * 30 + 15) * 3
  assert.deepEqual([...out.rgb.subarray(mid, mid + 3)], [200, 180, 20])
})

test("TEXTURE: THE TILED BACKGROUND'S OFFSET IS FOUND FROM THE EDGE, SUBTRACTED, THE ICON LEFT", () => {
  let seed = 7
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 64
  const tex = picture(64, 64, () => {
    const v = 20 + rand()
    return [v, v + 3, v + 1]
  })
  const px = (x: number, y: number): number[] => [...tex.data.subarray((((y + 9) % 64) * 64 + ((x + 21) % 64)) * 4, (((y + 9) % 64) * 64 + ((x + 21) % 64)) * 4 + 3)]
  const img = picture(48, 48, (x, y) => (x > 18 && x < 30 && y > 18 && y < 30 ? [230, 230, 230] : px(x, y)))
  const fit = fitTexture(img, { x: 0, y: 0, w: 48, h: 48 }, tex)
  assert.deepEqual([fit.dx, fit.dy, fit.rms], [21, 9, 0])
  const out = textureRemoved(img, { x: 0, y: 0, w: 48, h: 48 }, { tex, fit })
  assert.deepEqual([...out.rgb.subarray(0, 3)], [0, 0, 0])
  const mid = (24 * 48 + 24) * 3
  assert.deepEqual([...out.rgb.subarray(mid, mid + 3)], [230, 230, 230])
})

test('OCR INPUT: LIGHT TEXT ON DARK BECOMES DARK ON LIGHT, AS A PNG; SMALL WINDOWS 3X, BIG ONES LESS', () => {
  const img = picture(4, 2, (x) => (x < 2 ? [250, 250, 250] : [10, 0, 0]))
  const { w, h, gray } = ocrGray(img, 3)
  assert.deepEqual([w, h], [12, 6])
  const dir = mkdtempSync(join(tmpdir(), 'eq-png-'))
  try {
    writeFileSync(join(dir, 'g.png'), grayPng(w, h, gray))
    const back = readPng(join(dir, 'g.png'))
    assert.deepEqual([back.w, back.h], [12, 6])
    assert.ok(back.data[0] < 20 && back.data[(11) * 4] > 230)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(ocrScale(336, 420), 3)
  assert.equal(ocrScale(642, 979), 2)
})

test("OCR TSV: WORDS JOIN INTO LINES; A LINE'S LEAD IS ITS FIRST REAL WORD, NOT THE ICON'S JUNK", () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '5\t1\t1\t1\t1\t1\t30\t300\t9\t30\t40\t|',
    '5\t1\t1\t1\t1\t2\t219\t279\t150\t30\t90\tClass:',
    '5\t1\t1\t1\t1\t3\t380\t279\t90\t30\t90\tRNG',
    '5\t1\t1\t1\t2\t1\t219\t321\t120\t30\t90\tRace:'
  ].join('\n')
  const lines = linesFromTsv(tsv, 3)
  assert.deepEqual(lines.map((l) => l.text), ['| Class: RNG', 'Race:'])
  assert.deepEqual(lines[0].lead, { x: 73, y: 93, w: 50, h: 10 })
  assert.equal(lines[0].box.x, 10)
  // A junk word that looks real (`By`, the icon's edge on Lizardman Mystic Scale): the Class word still leads.
  const by = linesFromTsv([tsv.split('\n')[0], '5\t1\t1\t1\t1\t1\t81\t264\t69\t51\t40\tBy', '5\t1\t1\t1\t1\t2\t219\t279\t150\t30\t90\tClass:'].join('\n'), 3)
  assert.deepEqual(by[0].lead, { x: 73, y: 93, w: 50, h: 10 })
})

test('THE ICON SITS LEFT OF THE CLASS WORD, ITS TOP AT THE NAME LINE, SIZED BY THE LINE PITCH', () => {
  const line = (text: string, x: number, y: number): { text: string; box: { x: number; y: number; w: number; h: number }; lead: { x: number; y: number; w: number; h: number } } => ({
    text,
    box: { x: 5, y, w: 100, h: 10 },
    lead: { x, y, w: 30, h: 10 }
  })
  const r = iconRegion([line('Ruined Robe', 73, 61), line('Lore Equipped', 73, 77), line('Class: NEC', 73, 93), line('Race: ALL', 73, 107)], 336, 420)
  assert.ok(r !== null)
  // pitch 14: side 47.6, right edge just left of x = 73, top 2.5 pitches above Class
  assert.ok(Math.abs(r.x + r.w - 71) <= 2 && Math.abs(r.y - 58) <= 1 && Math.abs(r.w - 48) <= 1, JSON.stringify(r))
  assert.equal(iconRegion([line('nothing here', 10, 10)], 100, 100), null)
})

test('OCR READS ITS ENGLISH DATA FROM DISK, NEVER A URL (rule 15: no CDN fallback)', () => {
  const dir = langPath()
  assert.ok(!/^[a-z][a-z0-9+.-]*:\/\//i.test(dir), dir)
  assert.ok(existsSync(join(dir, 'eng.traineddata.gz')), dir)
})
