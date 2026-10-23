// IPC: a pasted picture of a mob, saved under its wiki file name (owner, 2026-10-21). The Save dialog
// opens in the folder of the last save (as MS Paint does); with an auto-save folder set there is no
// dialog, and an existing file is replaced only when the player says (the wiki needs that exact
// name, so no suffix). A blank picture is refused before anything is written. Whether the mob's
// nameplate is in the picture is checked AFTER the save, off the main thread (OCR can take seconds
// on a full screenshot); the panel then offers to delete a file this run saved.
//
// THE FOLDER IS A ROOT (owner, 2026-10-22: "<dir-they-chose>/npc, <dir-they-chose>/item,
// <dir-they-chose>/spell ... this way all items pasted get stored"): the auto-save folder, else the
// last folder saved to. Mob pictures go to <root>/npc, item windows and Lore tabs to <root>/item,
// spell windows to <root>/spell (shared/mobPicture.ts names them). A picture already there, or at the
// root where the owner's earlier ones sit, counts as saved. The player's files are never moved,
// renamed or deleted; main writes only .png, only under the root.
//
// Nothing here throws to the renderer (review, 2026-10-21): a failed write or dialog answers
// `{ status: 'error' }` with the player's words, so the panel never spins forever.

import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { IPC } from '../../shared/ipc'
import { folderPictures, keptPictureFile, PICTURE_FOLDER, pictureFileName, pictureRoot, type FolderPictures, type PictureKeep, type PictureKind, type PictureSave } from '../../shared/mobPicture'
import { showsName } from '../shot/nameplate'
import { deleteSafely, pictureIn, writeSafely } from '../shot/pictureFiles'
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

/** The picture root: the auto-save folder, else the last folder saved to (a kind's folder stands for its root). */
function pictureRootDir(s: PictureSettings = settings()): string | undefined {
  const dir = live(s.autoDir) ?? live(s.lastDir)
  return dir === undefined ? undefined : live(pictureRoot(dir))
}

/** `<root>/<kind's folder>`, made when missing; undefined when it cannot be. */
function kindDir(root: string, kind: PictureKind): string | undefined {
  const dir = join(root, PICTURE_FOLDER[kind])
  try {
    mkdirSync(dir, { recursive: true })
    return dir
  } catch {
    return undefined
  }
}

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
  // The root, not its npc folder: the next save files under the same root.
  setSettings({ lastDir: pictureRoot(dirname(file)) })
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

/** Straight into `<auto-save root>/npc`, no dialog; an existing file is replaced only on `overwrite`. */
function autoSave(auto: string, pic: { png: Buffer; rgba: Rgba; name: string }, overwrite: unknown): PictureSave {
  const dir = kindDir(pictureRoot(auto), 'npc')
  if (dir === undefined) return { status: 'error', message: `Could not make the npc folder in ${auto}.` }
  const path = join(dir, pic.name)
  return existsSync(path) && overwrite !== true ? { status: 'exists', path } : writePicture(path, pic.png, pic.rgba)
}

async function savePicture(bytes: unknown, fileName: unknown, overwrite: unknown): Promise<PictureSave> {
  try {
    const pic = pictureOf(bytes, fileName)
    if ('status' in pic) return pic
    const { png, rgba, name } = pic
    const s = settings()
    const auto = live(s.autoDir)
    if (auto !== undefined) return autoSave(auto, pic, overwrite)
    const root = pictureRootDir(s)
    const start = root === undefined ? app.getPath('pictures') : (kindDir(root, 'npc') ?? root)
    const owner = BrowserWindow.getFocusedWindow()
    const opts = { defaultPath: join(start, name), filters: [{ name: 'PNG image', extensions: ['png'] }] }
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
    return await showsName(slot.rgba, name)
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

/**
 * The folders a picture may already sit in, first wins a name: for the auto-save root, then the
 * last folder's root, its npc, item and spell folders and the root itself (the owner's earlier
 * pictures sit at the root); each once, each still there. The names never meet (`npc_`, `item_`,
 * `spell_`), so a mob's picture is found as before.
 */
function pictureDirs(): string[] {
  const s = settings()
  const roots = [live(s.autoDir), live(s.lastDir)].filter((d): d is string => d !== undefined).map(pictureRoot)
  const kinds = [PICTURE_FOLDER.npc, PICTURE_FOLDER.item, PICTURE_FOLDER.spell]
  const dirs = roots.flatMap((r) => [...kinds.map((k) => join(r, k)), r]).filter((d) => existsSync(d))
  return dirs.filter((d, i) => dirs.findIndex((o) => resolve(o).toLowerCase() === resolve(d).toLowerCase()) === i)
}

const isKeepKind = (k: unknown): k is 'item' | 'lore' | 'spell' => k === 'item' || k === 'lore' || k === 'spell'
const isPictureBytes = (b: unknown): b is Uint8Array => b instanceof Uint8Array && b.length > 0 && b.length <= MAX_PICTURE_BYTES

/**
 * Keep an item window, Lore tab or spell window picture as a working copy under the root
 * (`<root>/item/item_<name>.png`, `..._lore.png`, `<root>/spell/spell_<name>.png`): replaced by the next
 * paste of the same part, never a dialog. `off` when no folder is chosen yet; never throws.
 */
function keepPicture(kind: unknown, name: unknown, bytes: unknown): PictureKeep {
  try {
    if (!isKeepKind(kind) || typeof name !== 'string' || !isPictureBytes(bytes)) return { status: 'error', message: 'Not a picture.' }
    const root = pictureRootDir()
    if (root === undefined) return { status: 'off' }
    const img = nativeImage.createFromBuffer(Buffer.from(bytes))
    if (img.isEmpty()) return { status: 'error', message: 'Not a picture.' }
    const dir = kindDir(root, kind)
    if (dir === undefined) return { status: 'error', message: `Could not make the ${PICTURE_FOLDER[kind]} folder in ${root}.` }
    const path = join(dir, keptPictureFile(kind, name))
    const wrote = writeSafely(path, img.toPNG())
    if (!wrote.ok) return { status: 'error', message: wrote.message }
    saved.add(path)
    return { status: 'saved', path }
  } catch (e) {
    return { status: 'error', message: `Could not keep the picture: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * The `.png` files in the picture folders (owner, 2026-10-22: "sometimes i may put an image in the
 * directory, if I do, the tool should see that the image is there and not ask for it"). Read-only:
 * names only, nothing opened, nothing changed. A folder that cannot be read lists nothing.
 */
function listFolderPictures(): FolderPictures {
  return folderPictures(
    pictureDirs().map((dir) => {
      try {
        const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.png$/i.test(e.name))
        return { dir, files: names.map((e) => ({ name: e.name, path: join(dir, e.name) })) }
      } catch {
        return { dir, files: [] }
      }
    })
  )
}

/** A picture in one of the picture folders that is there now: the player's own file, shown never deleted. */
function inPictureDir(path: string): boolean {
  const dir = resolve(dirname(path)).toLowerCase()
  return /\.png$/i.test(path) && existsSync(path) && pictureDirs().some((d) => resolve(d).toLowerCase() === dir)
}

/**
 * A file this run saved: show it in its folder, or delete it (a picture the player discarded). A
 * picture found in a picture folder may be shown too, never deleted: the app did not write it.
 */
function savedFile(action: unknown, path: unknown): boolean {
  if (typeof path !== 'string') return false
  if (!saved.has(path)) {
    if (action !== 'show' || !inPictureDir(path)) return false
    shell.showItemInFolder(path)
    return true
  }
  if (action === 'show') shell.showItemInFolder(path)
  if (action !== 'delete') return true
  const gone = deleteSafely(path)
  if (gone) saved.delete(path)
  return gone
}

/** Pictures shown in the details pane, by path, while their file is unchanged. */
const shown = new Map<string, { mtimeMs: number; url: string }>()
/** Past this many the oldest goes: a details pane shows one picture at a time. */
const SHOWN_KEEP = 24

/**
 * A picture for the row's details pane (owner, 2026-10-22: "can we show the picture if we have it?"),
 * as a data URL: only a `.png` directly in a picture folder (pictureIn), never past the picture cap,
 * read again only when the file changed. Null for anything else; never throws.
 */
function pictureData(path: unknown): string | null {
  try {
    if (typeof path !== 'string' || !pictureIn(path, pictureDirs()) || !existsSync(path)) return null
    const { mtimeMs, size } = statSync(path)
    if (size > MAX_PICTURE_BYTES) return null
    const had = shown.get(path)
    if (had?.mtimeMs === mtimeMs) return had.url
    const url = `data:image/png;base64,${readFileSync(path).toString('base64')}`
    shown.delete(path)
    shown.set(path, { mtimeMs, url })
    for (const old of shown.keys()) {
      if (shown.size <= SHOWN_KEEP) break
      shown.delete(old)
    }
    return url
  } catch {
    return null
  }
}

export function registerShotPictureIpc(): void {
  ipcMain.handle(IPC.shotPictureData, (_e, path: unknown) => pictureData(path))
  ipcMain.handle(IPC.shotSaveImage, (_e, png: unknown, fileName: unknown, overwrite: unknown) => savePicture(png, fileName, overwrite))
  ipcMain.handle(IPC.shotCheckMob, (_e, checkId: unknown, name: unknown) => hasMobName(checkId, name))
  ipcMain.handle(IPC.shotAutoDir, (_e, action: unknown) => autoDir(action).catch(() => null))
  ipcMain.handle(IPC.shotSavedFile, (_e, action: unknown, path: unknown) => savedFile(action, path))
  ipcMain.handle(IPC.shotKeepPicture, (_e, kind: unknown, name: unknown, png: unknown) => keepPicture(kind, name, png))
  ipcMain.handle(IPC.shotFolderPictures, () => {
    try {
      return listFolderPictures()
    } catch {
      return { dirs: [], files: {} }
    }
  })
}
