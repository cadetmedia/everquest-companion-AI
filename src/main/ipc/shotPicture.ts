// IPC: a pasted picture of a mob, saved under its wiki file name (owner, 2026-10-21). The Save dialog
// opens in the folder of the last save (as MS Paint does); with an auto-save folder set there is no
// dialog, and an existing file is replaced only when the player says (the wiki needs that exact
// name, so no suffix). A blank picture is refused before anything is written. Whether the mob's
// nameplate is in the picture is checked AFTER the save, off the main thread (OCR can take seconds
// on a full screenshot); the panel then offers to delete a file this run saved.
//
// Nothing here throws to the renderer (review, 2026-10-21): a failed write or dialog answers
// `{ status: 'error' }` with the player's words, so the panel never spins forever.

import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { nameInLines, pictureFileName, type PictureSave } from '../../shared/mobPicture'
import { readLines } from '../shot/ocr'
import { deleteSafely, writeSafely } from '../shot/pictureFiles'
import { bgraToRgba, isNearSolid, type Rgba } from '../shot/pixels'

/** A pasted picture past this is not a game screenshot (a 4K screen is 33 MB of pixels). */
export const MAX_PICTURE_BYTES = 40 * 1024 * 1024

/** PNG (or JPEG) bytes -> RGBA through Chromium's own decoder; null when it is not a picture or past the pixel cap. */
export function decodePicture(png: Uint8Array): Rgba | null {
  const img = nativeImage.createFromBuffer(Buffer.from(png))
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  return bgraToRgba(img.toBitmap(), width, height)
}

interface PictureSettings {
  /** The folder of the last save, for the next dialog. */
  lastDir?: string
  /** Save straight here, with no dialog; unset = the dialog. */
  autoDir?: string
}

const SETTINGS = (): string => join(app.getPath('userData'), 'shot-settings.json')

function settings(): PictureSettings {
  try {
    const s: unknown = JSON.parse(readFileSync(SETTINGS(), 'utf8'))
    return s !== null && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

function setSettings(patch: PictureSettings): void {
  try {
    writeFileSync(SETTINGS(), JSON.stringify({ ...settings(), ...patch }))
  } catch {
    // Only the remembered folders are lost.
  }
}

/** A folder from the settings that still exists. */
const live = (dir: string | undefined): string | undefined => (dir !== undefined && existsSync(dir) ? dir : undefined)

/** Files this run saved: the only ones the panel may delete. */
const saved = new Set<string>()

/**
 * The last saved picture, decoded, for its nameplate check: decoded once per paste (review: a 4K
 * picture took ~300 ms each decode). One slot: a newer save replaces it, and its id no longer matches.
 */
let checkSlot: { id: number; rgba: Rgba } | null = null
let nextCheckId = 1

function writePicture(path: string, png: Buffer, rgba: Rgba): PictureSave {
  const file = /\.png$/i.test(path) ? path : `${path}.png`
  const wrote = writeSafely(file, png)
  if (!wrote.ok) return { status: 'error', message: wrote.message }
  saved.add(file)
  setSettings({ lastDir: dirname(file) })
  checkSlot = { id: nextCheckId++, rgba }
  return { status: 'saved', path: file, checkId: checkSlot.id }
}

/** The picture decoded, as PNG, and its safe file name; a refusal when it is not a picture, or a blank one. */
function pictureOf(bytes: unknown, fileName: unknown): { png: Buffer; rgba: Rgba; name: string } | PictureSave {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_PICTURE_BYTES || typeof fileName !== 'string') return { status: 'error', message: 'Not a picture.' }
  const rgba = decodePicture(bytes)
  if (rgba === null) return { status: 'error', message: 'Not a picture, or larger than a 4K screen.' }
  if (isNearSolid(rgba)) return { status: 'blank' }
  return { png: nativeImage.createFromBuffer(Buffer.from(bytes)).toPNG(), rgba, name: pictureFileName(fileName) }
}

async function savePicture(bytes: unknown, fileName: unknown, overwrite: unknown): Promise<PictureSave> {
  try {
    const pic = pictureOf(bytes, fileName)
    if ('status' in pic) return pic
    const { png, rgba, name } = pic
    const s = settings()
    const auto = live(s.autoDir)
    if (auto !== undefined) {
      const path = join(auto, name)
      return existsSync(path) && overwrite !== true ? { status: 'exists', path } : writePicture(path, png, rgba)
    }
    const owner = BrowserWindow.getFocusedWindow()
    const opts = { defaultPath: join(live(s.lastDir) ?? app.getPath('pictures'), name), filters: [{ name: 'PNG image', extensions: ['png'] }] }
    const pick = owner === null ? await dialog.showSaveDialog(opts) : await dialog.showSaveDialog(owner, opts)
    return pick.canceled || pick.filePath === undefined ? { status: 'cancelled' } : writePicture(pick.filePath, png, rgba)
  } catch (e) {
    return { status: 'error', message: `Could not save it: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Whether the mob's name shows in the saved picture (its nameplate); null when it could not be read or is no longer the last save. */
async function hasMobName(checkId: unknown, name: unknown): Promise<boolean | null> {
  const slot = checkSlot
  if (slot === null || slot.id !== checkId || typeof name !== 'string') return null
  try {
    return nameInLines(name, (await readLines(slot.rgba)).map((l) => l.text))
  } catch {
    return null
  } finally {
    if (checkSlot?.id === slot.id) checkSlot = null
  }
}

/** The auto-save folder: read it, pick one (a folder dialog), or turn it off. */
async function autoDir(action: unknown): Promise<string | null> {
  if (action === 'clear') setSettings({ autoDir: undefined })
  if (action === 'pick') {
    const owner = BrowserWindow.getFocusedWindow()
    const opts = { properties: ['openDirectory' as const, 'createDirectory' as const], defaultPath: live(settings().autoDir) ?? live(settings().lastDir) ?? app.getPath('pictures') }
    const pick = owner === null ? await dialog.showOpenDialog(opts) : await dialog.showOpenDialog(owner, opts)
    if (!pick.canceled && pick.filePaths[0] !== undefined) setSettings({ autoDir: pick.filePaths[0] })
  }
  return live(settings().autoDir) ?? null
}

/** A file this run saved: show it in its folder, or delete it (a picture the player discarded). */
function savedFile(action: unknown, path: unknown): boolean {
  if (typeof path !== 'string' || !saved.has(path)) return false
  if (action === 'show') shell.showItemInFolder(path)
  if (action !== 'delete') return true
  const gone = deleteSafely(path)
  if (gone) saved.delete(path)
  return gone
}

export function registerShotPictureIpc(): void {
  ipcMain.handle(IPC.shotSaveImage, (_e, png: unknown, fileName: unknown, overwrite: unknown) => savePicture(png, fileName, overwrite))
  ipcMain.handle(IPC.shotCheckMob, (_e, checkId: unknown, name: unknown) => hasMobName(checkId, name))
  ipcMain.handle(IPC.shotAutoDir, (_e, action: unknown) => autoDir(action).catch(() => null))
  ipcMain.handle(IPC.shotSavedFile, (_e, action: unknown, path: unknown) => savedFile(action, path))
}
