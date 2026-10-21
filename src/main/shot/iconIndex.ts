// iconIndex.ts — every item icon in the player's install, as a small vector per icon, for the icon
// finder (iconMatch.ts). Built from `uifiles/default/dragitem*.dds` on the first paste, cached in
// userData, rebuilt when the sheets change (count, bytes or newest mtime). Nothing derived from the
// game's art is shipped or committed (plans/2026-10-20-screenshot-to-wiki.md).
//
// The build decodes ~380 sheets (2.6 s in the prototype); it yields after each sheet, so the main
// process never holds a long task (audits/2026-10-20-performance-review.md).
//
// ELECTRON-FREE: the caller passes the directories.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contentBox, resizeRgb, type Box } from './pixels'
import { cutCell, decodeDds, iconIdOf, ICON_CELL, ICON_GRID, cellOf } from './gameTextures'

/** The coarse vector: the icon's content box resized to F x F RGB. */
export const F = 16
export const FD = F * F * 3
const MAGIC = 'EQIX2'

export interface IconIndex {
  n: number
  ids: Uint32Array
  /** x, y, w, h of each icon's content box inside its 40x40 cell. */
  boxes: Uint8Array
  feats: Uint8Array
}

const SHEET_RE = /^dragitem(\d+)\.dds$/i

/** The sheets by number, from the install's default UI folder. */
export function iconSheets(uiDir: string): { n: number; path: string }[] {
  if (!existsSync(uiDir)) return []
  return readdirSync(uiDir)
    .flatMap((f) => {
      const m = SHEET_RE.exec(f)
      return m === null ? [] : [{ n: Number(m[1]), path: join(uiDir, f) }]
    })
    .sort((a, b) => a.n - b.n)
}

/** What decides the cache is stale: the sheet count, their bytes and the newest mtime. */
export function sheetsFingerprint(sheets: readonly { path: string }[]): string {
  let bytes = 0
  let newest = 0
  for (const s of sheets) {
    const st = statSync(s.path)
    bytes += st.size
    newest = Math.max(newest, Math.floor(st.mtimeMs))
  }
  return `${String(sheets.length)}:${String(bytes)}:${String(newest)}`
}

/** One cell over black, as float RGB. */
export function cellRgb(cell: Uint8Array): Float32Array {
  const rgb = new Float32Array(ICON_CELL * ICON_CELL * 3)
  for (let i = 0; i < ICON_CELL * ICON_CELL; i++) {
    const a = cell[i * 4 + 3] / 255
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = cell[i * 4 + c] * a
  }
  return rgb
}

/** The vector for one icon's content box (shared with the query side). */
export function featureOf(rgb: Float32Array, w: number, box: Box): Float32Array {
  return resizeRgb({ rgb, w }, box, { w: F, h: F })
}

interface Rec {
  id: number
  box: Box
  feat: Float32Array
}

function sheetRecs(n: number, file: Uint8Array): Rec[] {
  const sheet = decodeDds(file)
  if (sheet === null) return []
  const out: Rec[] = []
  for (let col = 0; col < ICON_GRID; col++) {
    for (let row = 0; row < ICON_GRID; row++) {
      const rgb = cellRgb(cutCell(sheet, col, row))
      const box = contentBox(rgb, ICON_CELL, ICON_CELL)
      if (box === null || box.w * box.h < 4) continue
      out.push({ id: iconIdOf(n, col, row), box, feat: featureOf(rgb, ICON_CELL, box) })
    }
  }
  return out
}

const yieldNow = (): Promise<void> => new Promise((r) => setImmediate(r))

/** Decode every sheet, a sheet per turn of the event loop. */
export async function buildIconIndex(sheets: readonly { n: number; path: string }[]): Promise<IconIndex> {
  const recs: Rec[] = []
  for (const s of sheets) {
    recs.push(...sheetRecs(s.n, readFileSync(s.path)))
    await yieldNow()
  }
  const index: IconIndex = { n: recs.length, ids: new Uint32Array(recs.length), boxes: new Uint8Array(recs.length * 4), feats: new Uint8Array(recs.length * FD) }
  recs.forEach((r, i) => {
    index.ids[i] = r.id
    index.boxes.set([r.box.x, r.box.y, r.box.w, r.box.h], i * 4)
    for (let k = 0; k < FD; k++) index.feats[i * FD + k] = Math.round(r.feat[k])
  })
  return index
}

/** Header line `EQIX2 <fingerprint> <n>\n`, then ids, boxes and vectors. */
export function writeIconIndex(path: string, fp: string, index: IconIndex): void {
  const head = Buffer.from(`${MAGIC} ${fp} ${String(index.n)}\n`, 'latin1')
  writeFileSync(path, Buffer.concat([head, Buffer.from(index.ids.buffer), Buffer.from(index.boxes), Buffer.from(index.feats)]))
}

/** The cached index when it was built from these same sheets; null otherwise. */
export function readIconIndex(path: string, fp: string): IconIndex | null {
  if (!existsSync(path)) return null
  const buf = readFileSync(path)
  const nl = buf.indexOf(10)
  const [magic, cachedFp, nText] = buf.subarray(0, Math.max(0, nl)).toString('latin1').split(' ')
  const n = Number(nText)
  if (magic !== MAGIC || cachedFp !== fp || !Number.isInteger(n) || buf.length !== nl + 1 + n * (4 + 4 + FD)) return null
  const body = buf.subarray(nl + 1)
  const ids = new Uint32Array(n)
  for (let i = 0; i < n; i++) ids[i] = body.readUInt32LE(i * 4)
  return { n, ids, boxes: new Uint8Array(body.subarray(n * 4, n * 8)), feats: new Uint8Array(body.subarray(n * 8)) }
}

/** Full-size cells for the re-rank and for the picker's thumbnails, a few sheets kept decoded. */
export class SheetCells {
  private cache = new Map<number, ReturnType<typeof decodeDds>>()

  constructor(
    private readonly uiDir: string,
    private readonly keep = 64
  ) {}

  /** The icon's 40x40 RGBA; null when its sheet is missing or unreadable. */
  cell(id: number): Uint8Array | null {
    const { sheet, col, row } = cellOf(id)
    let s = this.cache.get(sheet)
    if (s === undefined) {
      const path = join(this.uiDir, `dragitem${String(sheet)}.dds`)
      s = existsSync(path) ? decodeDds(readFileSync(path)) : null
      const oldest = this.cache.keys().next()
      if (this.cache.size >= this.keep && oldest.done !== true) this.cache.delete(oldest.value)
      this.cache.set(sheet, s)
    }
    return s === null ? null : cutCell(s, col, row)
  }
}
