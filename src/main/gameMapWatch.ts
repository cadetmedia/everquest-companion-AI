// gameMapWatch.ts — is the in-game map open? Watched for the Map pins overlay, which can hide while
// it is closed (owner ask, 2026-10-13; the reading rules are shared/gameMapIni.ts).
//
// READ-ONLY AND LIGHT: one stat of one file every half second, and a read only when its mtime
// moved, and only while the Map pins window exists; it stops itself when the window is gone. The
// character's file is re-found every 15 s, so a character switch follows within that.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import { parseMapShown, pickUiIni } from '../shared/gameMapIni'
import { resolveActiveCharacter } from './log/config'
import { getOverlayWindow } from './windows'

const POLL_MS = 500
const REFIND_MS = 15_000
/** No file yet (no character, or not logged in): look again sooner than a switch is checked. */
const MISS_MS = 2_000

let timer: ReturnType<typeof setInterval> | null = null
let path: string | null = null
let foundAt = 0
let mtime = 0
let shown: boolean | null = null

function findIni(): string | null {
  const c = resolveActiveCharacter()
  if (c == null) return null
  // The logs folder sits in the game folder, beside the UI files.
  const root = dirname(dirname(c.logPath))
  const files = readdirSync(root)
    .filter((n) => n.toLowerCase().startsWith('ui_'))
    .map((n) => ({ name: n, mtime: statSync(join(root, n)).mtimeMs }))
  const name = pickUiIni(files, c.name, c.server)
  return name == null ? null : join(root, name)
}

function read(): void {
  const now = Date.now()
  if (foundAt === 0 || now - foundAt > (path == null ? MISS_MS : REFIND_MS)) {
    // Stamped first, so a find that throws is not retried on every tick.
    foundAt = now
    const next = findIni()
    if (next !== path) mtime = 0
    path = next
  }
  if (path == null) {
    // No file to read: the answer is "cannot be found", never the last file's.
    shown = null
    return
  }
  const m = statSync(path).mtimeMs
  if (m === mtime) return
  mtime = m
  shown = parseMapShown(readFileSync(path, 'latin1'))
}

function tick(): void {
  const w = getOverlayWindow('mapPins')
  if (w == null || w.isDestroyed()) {
    stopGameMapWatch()
    return
  }
  const was = shown
  try {
    read()
  } catch {
    // Mid-write, locked, or gone: keep the last answer and try again next tick.
  }
  if (shown !== was) w.webContents.send(IPC.onGameMapShown, shown)
}

/** Start watching (idempotent) and answer what is known now: null until a file says. */
export function gameMapShown(): boolean | null {
  if (timer == null) {
    try {
      read()
    } catch {
      // As in tick.
    }
    timer = setInterval(tick, POLL_MS)
  }
  return shown
}

export function stopGameMapWatch(): void {
  if (timer != null) clearInterval(timer)
  timer = null
  path = null
  foundAt = 0
  mtime = 0
  shown = null
}
