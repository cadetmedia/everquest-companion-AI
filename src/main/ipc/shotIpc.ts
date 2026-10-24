// IPC: screenshot to wiki (owner ask, 2026-10-21; plans/2026-10-20-screenshot-to-wiki.md). The Gaps
// tab pastes a picture; main reads it on this machine (OCR in a worker thread, the icon against the
// install's own icon sheets) and answers the page's fields. No network, no tokens, nothing shipped:
// the icon index is built from the player's install on the first paste and cached in userData.

import { app, clipboard, ipcMain, nativeImage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { nearNames } from '../../shared/itemShotKeep'
import type { ItemShotReply } from '../../shared/itemWindow'
import type { ShotTextReply } from '../../shared/spellWindow'
import itemsJson from '../data/items.json'
import { logInfo } from '../errorLog'
import type { ItemDbFile } from '../itemsDb'
import { effectiveEqRoot } from '../log/config'
import { decodeTga } from '../shot/gameTextures'
import { buildIconIndex, iconSheets, readIconIndex, sheetsFingerprint, SheetCells, writeIconIndex, type IconIndex } from '../shot/iconIndex'
import { readJournalLines } from '../shot/journalLines'
import { readPopupLines } from '../shot/popupLines'
import { readLines } from '../shot/ocr'
import type { Rgba } from '../shot/pixels'
import { readItemShot, type ShotReaders } from '../shot/readItemShot'
import { decodePicture, MAX_PICTURE_BYTES as MAX_BYTES, registerShotPictureIpc } from './shotPicture'

/** The skins' window backgrounds that the item window can draw (EQUI_Templates.xml `WDT_Inner`). */
const TEXTURES = ['default/wnd_bg_dark_rock.tga', 'default/wnd_bg_mid_rock.tga', 'default/wnd_bg_light_rock.tga', 'default_modern/wnd_bg_dark_rock.tga']

const uiRoot = (): string => join(effectiveEqRoot(), 'uifiles')

let index: { dir: string; index: Promise<IconIndex | null> } | null = null
let cells: SheetCells | null = null
let textures: Rgba[] | null = null

/** The icon index for the current install: the cache when its sheets are unchanged, else a fresh build. */
function iconIndex(): Promise<IconIndex | null> {
  const dir = join(uiRoot(), 'default')
  if (index?.dir === dir) return index.index
  cells = new SheetCells(dir)
  const build = async (): Promise<IconIndex | null> => {
    const sheets = iconSheets(dir)
    if (sheets.length === 0) return null
    const fp = sheetsFingerprint(sheets)
    const cache = join(app.getPath('userData'), 'item-icon-index.bin')
    const cached = readIconIndex(cache, fp)
    if (cached !== null) return cached
    const built = await buildIconIndex(sheets)
    try {
      writeIconIndex(cache, fp, built)
    } catch {
      // The index works from memory; only the next launch rebuilds it.
    }
    return built
  }
  index = { dir, index: build().catch(() => null) }
  return index.index
}

function skinTextures(): Rgba[] {
  textures ??= TEXTURES.flatMap((f) => {
    const path = join(uiRoot(), f)
    const t = existsSync(path) ? decodeTga(readFileSync(path)) : null
    return t === null ? [] : [t]
  })
  return textures
}

let catalog: string[] | null = null

/**
 * The item catalog's names (items.json, already in this bundle), listed on the first read, with each
 * record's otherNames: the wiki redirects that land on its page are names of that item too (owner,
 * 2026-10-22: Halfling Blood is Vial of Halfling Blood).
 */
function catalogNames(): string[] {
  const entries = Object.values((itemsJson as unknown as ItemDbFile).items) as (ItemDbFile['items'][string] & { otherNames?: string[] })[]
  catalog ??= [...new Set(entries.flatMap((e) => [e.name ?? e.page, ...(e.otherNames ?? [])]))]
  return catalog
}

export const READERS: ShotReaders = {
  index: iconIndex,
  cell: (id) => cells?.cell(id) ?? null,
  textures: skinTextures,
  known: (name) => nearNames(name, catalogNames())
}

async function readItem(png: unknown): Promise<ItemShotReply> {
  const empty: ItemShotReply = { read: { statsblock: '', unread: [] }, lines: [], icons: [], ms: 0 }
  if (!(png instanceof Uint8Array) || png.length === 0 || png.length > MAX_BYTES) return { ...empty, error: 'Not a picture.' }
  try {
    const img = decodePicture(png)
    if (img === null) return { ...empty, error: 'Not a picture, or larger than a 4K screen.' }
    const shot = await readItemShot(img, READERS)
    const noIcons = shot.icons.length === 0 && (await iconIndex()) === null
    return { read: shot.read, lines: shot.lines, icons: shot.icons, known: shot.known, ms: shot.ms, ...(noIcons ? { iconNote: 'No EverQuest install found with icon sheets (uifiles/default/dragitem*.dds).' } : {}) }
  } catch (e) {
    return { ...empty, error: `Could not read it: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * A picture's text lines (a spell display window), for shared/spellWindow.ts to map in the renderer;
 * a Quest Journal (`mode` journal) read its own way, with each line's shade (journalLines.ts).
 */
async function readText(png: unknown, mode?: unknown): Promise<ShotTextReply> {
  if (!(png instanceof Uint8Array) || png.length === 0 || png.length > MAX_BYTES) return { lines: [], ms: 0, error: 'Not a picture.' }
  const t0 = performance.now()
  try {
    const img = decodePicture(png)
    if (img === null) return { lines: [], ms: 0, error: 'Not a picture, or larger than a 4K screen.' }
    if (mode === 'journal') {
      const read = await readJournalLines(img)
      // The lines as read, so a journal the reader refuses can be checked from the dev log.
      logInfo(`[everquest-companion] quest journal read: ${read.lines.map((l, i) => `${l} [${String(read.shades[i])}]`).join(' | ')}`)
      return { ...read, ms: Math.round(performance.now() - t0) }
    }
    if (mode === 'popup') {
      // A popup window or a Quest Journal pasted on a Quests row: lines with where they sit and their colour.
      const read = await readPopupLines(img)
      return { ...read, ms: Math.round(performance.now() - t0) }
    }
    const lines = (await readLines(img)).map((l) => l.text)
    return { lines, ms: Math.round(performance.now() - t0) }
  } catch (e) {
    return { lines: [], ms: 0, error: `Could not read it: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** One icon from the install's sheets as a PNG data URL, for the picker; null when it is not there. */
async function iconUrl(id: unknown): Promise<string | null> {
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 500 || id > 100_000) return null
  await iconIndex()
  const cell = cells?.cell(id)
  if (cell === null || cell === undefined) return null
  const bgra = Buffer.alloc(cell.length)
  for (let i = 0; i < cell.length; i += 4) bgra.set([cell[i + 2], cell[i + 1], cell[i], cell[i + 3]], i)
  return nativeImage.createFromBitmap(bgra, { width: 40, height: 40 }).toDataURL()
}

/** The clipboard's picture (a Win+Shift+S snip), as PNG bytes; null when it holds none. */
function clipboardPng(): Uint8Array | null {
  const img = clipboard.readImage()
  return img.isEmpty() ? null : new Uint8Array(img.toPNG())
}

export function registerShotIpc(): void {
  ipcMain.handle(IPC.shotClipboard, () => clipboardPng())
  ipcMain.handle(IPC.shotReadItem, (_e, png: unknown) => readItem(png))
  ipcMain.handle(IPC.shotReadText, (_e, png: unknown, mode?: unknown) => readText(png, mode))
  ipcMain.handle(IPC.shotIcon, (_e, id: unknown) => iconUrl(id))
  registerShotPictureIpc()
}
