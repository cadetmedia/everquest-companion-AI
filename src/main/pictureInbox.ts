// pictureInbox — a folder the app reads pictures from as if they were pasted (owner, 2026-10-23: "i
// don't want to have to REPASTE the images I already gave you into the tool"). <userData>/picture-inbox:
// a .png, .jpg or .webp dropped there is handed to the main window's paste pipeline (GlobalPaste.tsx),
// in name order, then moved to done/ (or failed/, the reason in the dev log). The renderer pulls: it
// lists and reads on launch and whenever the watcher says something landed. A failed picture can be
// sent back to be read again (the Unsorted pictures list), once a later reader knows it.

import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, watch, type FSWatcher } from 'fs'
import { basename, extname, join } from 'path'
import { IPC } from '../shared/ipc'
import { logInfo, logWarn } from './errorLog'
import { sendToMain } from './windows'

const PICTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
/** Pictures larger than this are not read (the paste readers' own cap is about the same). */
const MAX_INBOX_BYTES = 40 * 1024 * 1024

export const inboxDir = (): string => join(app.getPath('userData'), 'picture-inbox')

function ensureDirs(): string {
  const dir = inboxDir()
  for (const sub of ['', 'done', 'failed']) mkdirSync(join(dir, sub), { recursive: true })
  return dir
}

/** The pictures waiting in a folder, in name order. */
function waiting(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && PICTURE_EXT.has(extname(d.name).toLowerCase()))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** A name the renderer sends back: only a waiting file's own name, never a path. */
function own(dir: string, name: unknown): string | null {
  if (typeof name !== 'string' || name !== basename(name)) return null
  return waiting(dir).includes(name) ? name : null
}

/** Move a read picture aside; a name already there gets the time in front. */
function moveAside(dir: string, name: string, ok: boolean): string {
  const sub = join(dir, ok ? 'done' : 'failed')
  const target = existsSync(join(sub, name)) ? join(sub, `${String(Date.now())}-${name}`) : join(sub, name)
  renameSync(join(dir, name), target)
  return target
}

/** A failed picture back into the inbox; a name already waiting gets the time in front. */
function retry(dir: string, name: unknown): boolean {
  const file = own(join(dir, 'failed'), name)
  if (file === null) return false
  const target = existsSync(join(dir, file)) ? join(dir, `${String(Date.now())}-${file}`) : join(dir, file)
  renameSync(join(dir, 'failed', file), target)
  logInfo(`[pictures] inbox ${file}: read again`)
  changed()
  return true
}

let watcher: FSWatcher | null = null
let pending: ReturnType<typeof setTimeout> | null = null

/** Tell the main window, once things settle (a copy of several files is many events). */
function changed(): void {
  if (pending !== null) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    sendToMain(IPC.onPictureInbox)
  }, 700)
}

export function registerPictureInboxIpc(): void {
  const dir = ensureDirs()
  logInfo(`[pictures] inbox: ${dir}`)
  ipcMain.handle(IPC.pictureInboxList, () => ({ dir, files: waiting(dir), failed: waiting(join(dir, 'failed')) }))
  ipcMain.handle(IPC.pictureInboxRetry, (_e, name: unknown) => retry(dir, name))
  ipcMain.handle(IPC.pictureInboxRead, (_e, name: unknown) => {
    const file = own(dir, name)
    if (file === null) return null
    const bytes = readFileSync(join(dir, file))
    return bytes.length > MAX_INBOX_BYTES ? null : new Uint8Array(bytes)
  })
  ipcMain.handle(IPC.pictureInboxDone, (_e, name: unknown, ok: unknown, reason: unknown) => {
    const file = own(dir, name)
    if (file === null) return false
    const to = moveAside(dir, file, ok === true)
    const why = typeof reason === 'string' ? reason.slice(0, 300) : ''
    if (ok === true) logInfo(`[pictures] inbox ${file} -> ${to}: ${why}`)
    else logWarn(`[pictures] inbox ${file} failed -> ${to}: ${why}`)
    return true
  })
  ipcMain.on(IPC.pictureLog, (_e, line: unknown) => {
    if (typeof line === 'string') logInfo(`[pictures] ${line.slice(0, 500)}`)
  })
  try {
    watcher = watch(dir, { persistent: false }, (_ev, f) => {
      if (f !== null && PICTURE_EXT.has(extname(f).toLowerCase())) changed()
    })
  } catch (e) {
    logWarn('[pictures] inbox watch failed', e)
  }
  app.on('will-quit', () => watcher?.close())
}
