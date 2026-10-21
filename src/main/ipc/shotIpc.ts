// IPC: screenshot to wiki (owner ask, 2026-10-21; plans/2026-10-20-screenshot-to-wiki.md). The Gaps
// tab pastes a picture; main reads it on this machine (OCR in a worker thread, the icon against the
// install's own icon sheets) and answers the page's fields. No network, no tokens, nothing shipped:
// the icon index is built from the player's install on the first paste and cached in userData.

import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc'
import type { ItemShotReply } from '../../shared/itemWindow'
import { effectiveEqRoot } from '../log/config'
import { decodeTga } from '../shot/gameTextures'
import { buildIconIndex, iconSheets, readIconIndex, sheetsFingerprint, SheetCells, writeIconIndex, type IconIndex } from '../shot/iconIndex'
import type { Rgba } from '../shot/pixels'
import { readItemShot, type ShotReaders } from '../shot/readItemShot'

/** A pasted picture past this is not a game window (a 4K screen is 33 MB of pixels). */
const MAX_BYTES = 40 * 1024 * 1024
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
    writeIconIndex(cache, fp, built)
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

/** PNG bytes -> RGBA through Chromium's own decoder; null for anything that is not a picture. */
function decodePicture(png: Uint8Array): Rgba | null {
  const img = nativeImage.createFromBuffer(Buffer.from(png))
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const bgra = img.toBitmap()
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([bgra[i * 4 + 2], bgra[i * 4 + 1], bgra[i * 4], bgra[i * 4 + 3]], i * 4)
  return { w: width, h: height, data }
}

const READERS: ShotReaders = {
  index: iconIndex,
  cell: (id) => cells?.cell(id) ?? null,
  textures: skinTextures
}

async function readItem(png: unknown): Promise<ItemShotReply> {
  const empty: ItemShotReply = { read: { statsblock: '', unread: [] }, lines: [], icons: [], ms: 0 }
  if (!(png instanceof Uint8Array) || png.length === 0 || png.length > MAX_BYTES) return { ...empty, error: 'Not a picture.' }
  const img = decodePicture(png)
  if (img === null) return { ...empty, error: 'Not a picture.' }
  try {
    const shot = await readItemShot(img, READERS)
    const noIcons = shot.icons.length === 0 && (await iconIndex()) === null
    return { read: shot.read, lines: shot.lines, icons: shot.icons, ms: shot.ms, ...(noIcons ? { iconNote: 'No EverQuest install found with icon sheets (uifiles/default/dragitem*.dds).' } : {}) }
  } catch (e) {
    return { ...empty, error: `Could not read it: ${e instanceof Error ? e.message : String(e)}` }
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

/** Save a pasted picture as a PNG under the wiki's file name, where the player chooses. */
async function saveImage(png: unknown, fileName: unknown): Promise<string | null> {
  if (!(png instanceof Uint8Array) || png.length === 0 || png.length > MAX_BYTES || typeof fileName !== 'string') return null
  const img = nativeImage.createFromBuffer(Buffer.from(png))
  if (img.isEmpty()) return null
  const name = fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
  const owner = BrowserWindow.getFocusedWindow()
  const opts = { defaultPath: join(app.getPath('pictures'), name), filters: [{ name: 'PNG image', extensions: ['png'] }] }
  const pick = owner === null ? await dialog.showSaveDialog(opts) : await dialog.showSaveDialog(owner, opts)
  if (pick.canceled || pick.filePath === undefined) return null
  writeFileSync(pick.filePath, img.toPNG())
  return pick.filePath
}

/** The clipboard's picture (a Win+Shift+S snip), as PNG bytes; null when it holds none. */
function clipboardPng(): Uint8Array | null {
  const img = clipboard.readImage()
  return img.isEmpty() ? null : new Uint8Array(img.toPNG())
}

export function registerShotIpc(): void {
  ipcMain.handle(IPC.shotClipboard, () => clipboardPng())
  ipcMain.handle(IPC.shotReadItem, (_e, png: unknown) => readItem(png))
  ipcMain.handle(IPC.shotIcon, (_e, id: unknown) => iconUrl(id))
  ipcMain.handle(IPC.shotSaveImage, (_e, png: unknown, fileName: unknown) => saveImage(png, fileName))
}
