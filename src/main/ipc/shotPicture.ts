// IPC: a pasted picture of a mob, saved under its wiki file name (owner, 2026-10-21). The Save dialog
// opens in the folder of the last save (as MS Paint does); with an auto-save folder set there is no
// dialog, and an existing file is replaced only when the player says (the wiki needs that exact
// name, so no suffix). A blank picture is refused before anything is written. Whether the mob's
// nameplate is in the picture is checked AFTER the save, off the main thread (OCR can take seconds
// on a full screenshot); the panel then offers to delete a file this run saved.

import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IPC } from '../../shared/ipc'
import { nameInLines, type PictureSave } from '../../shared/mobPicture'
import { readLines } from '../shot/ocr'
import { isNearSolid, type Rgba } from '../shot/pixels'

/** A pasted picture past this is not a game screenshot (a 4K screen is 33 MB of pixels). */
export const MAX_PICTURE_BYTES = 40 * 1024 * 1024

/** PNG (or JPEG) bytes -> RGBA through Chromium's own decoder; null for anything that is not a picture. */
export function decodePicture(png: Uint8Array): Rgba | null {
  const img = nativeImage.createFromBuffer(Buffer.from(png))
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const bgra = img.toBitmap()
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([bgra[i * 4 + 2], bgra[i * 4 + 1], bgra[i * 4], bgra[i * 4 + 3]], i * 4)
  return { w: width, h: height, data }
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

function writePicture(path: string, png: Buffer): PictureSave {
  writeFileSync(path, png)
  saved.add(path)
  setSettings({ lastDir: dirname(path) })
  return { status: 'saved', path }
}

/** The picture as PNG and its safe file name; a refusal when it is not a picture, or a blank one. */
function pictureOf(bytes: unknown, fileName: unknown): { png: Buffer; name: string } | PictureSave {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_PICTURE_BYTES || typeof fileName !== 'string') return { status: 'error', message: 'Not a picture.' }
  const rgba = decodePicture(bytes)
  if (rgba === null) return { status: 'error', message: 'Not a picture.' }
  if (isNearSolid(rgba)) return { status: 'blank' }
  return { png: nativeImage.createFromBuffer(Buffer.from(bytes)).toPNG(), name: fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) }
}

async function savePicture(bytes: unknown, fileName: unknown, overwrite: unknown): Promise<PictureSave> {
  const pic = pictureOf(bytes, fileName)
  if ('status' in pic) return pic
  const { png, name } = pic
  const s = settings()
  const auto = live(s.autoDir)
  if (auto !== undefined) {
    const path = join(auto, name)
    return existsSync(path) && overwrite !== true ? { status: 'exists', path } : writePicture(path, png)
  }
  const owner = BrowserWindow.getFocusedWindow()
  const opts = { defaultPath: join(live(s.lastDir) ?? app.getPath('pictures'), name), filters: [{ name: 'PNG image', extensions: ['png'] }] }
  const pick = owner === null ? await dialog.showSaveDialog(opts) : await dialog.showSaveDialog(owner, opts)
  return pick.canceled || pick.filePath === undefined ? { status: 'cancelled' } : writePicture(pick.filePath, png)
}

/** Whether the mob's name shows in the picture (its nameplate); null when it could not be read. */
async function hasMobName(bytes: unknown, name: unknown): Promise<boolean | null> {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PICTURE_BYTES || typeof name !== 'string') return null
  const rgba = decodePicture(bytes)
  if (rgba === null) return null
  try {
    return nameInLines(name, (await readLines(rgba)).map((l) => l.text))
  } catch {
    return null
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
  if (action === 'delete' && existsSync(path)) {
    unlinkSync(path)
    saved.delete(path)
  }
  return true
}

export function registerShotPictureIpc(): void {
  ipcMain.handle(IPC.shotSaveImage, (_e, png: unknown, fileName: unknown, overwrite: unknown) => savePicture(png, fileName, overwrite))
  ipcMain.handle(IPC.shotCheckMob, (_e, png: unknown, name: unknown) => hasMobName(png, name))
  ipcMain.handle(IPC.shotAutoDir, (_e, action: unknown) => autoDir(action))
  ipcMain.handle(IPC.shotSavedFile, (_e, action: unknown, path: unknown) => savedFile(action, path))
}
