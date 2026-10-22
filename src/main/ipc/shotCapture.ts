// IPC: the capture hotkey (phase 3 of screenshot to wiki; owner, 2026-10-21). In the game, the
// player presses the hotkey over an open item window; main grabs the EverQuest window (the window,
// not the screen: Electron's desktopCapturer, no cursor), finds the item window by its yellow tab
// label (shot/findWindow.ts), reads it on this machine, and keeps the reading for the Gaps tab, which
// files it on the item's row by name. Nothing touches the game: a picture of its window, as a
// screenshot tool takes one.
//
// The hotkey is Electron's globalShortcut (Windows RegisterHotKey: a registered key, not a keyboard
// hook). Off until the player sets one; Ctrl, Alt or Win required (shared/shotHotkey.ts). A new key
// is registered before the old one is let go, so a refused key leaves the old one working.

import { desktopCapturer, globalShortcut, ipcMain, screen } from 'electron'
import { IPC } from '../../shared/ipc'
import { hotkeyProblem, type Captured } from '../../shared/shotHotkey'
import { readCapture } from '../shot/captureRead'
import { bgraToRgba } from '../shot/pixels'
import { getMainWindow } from '../windows'
import { setSettings, settings } from './shotPicture'
import { READERS } from './shotIpc'

/** Kept until the Gaps tab takes them; the oldest go past this many. */
const KEEP = 20
/** A held key repeats: presses closer than this are one. */
const DEBOUNCE_MS = 1500

const waiting: Captured[] = []
let current: string | null = null
let busy = false
let last = 0

/** The EverQuest window's picture at the display's full size, or why there is none. */
async function grabGame(): Promise<{ name: string; img: ReturnType<typeof bgraToRgba> } | { error: string }> {
  const d = screen.getPrimaryDisplay()
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) }
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: size, fetchWindowIcons: false })
  const eq = sources.find((s) => /^EverQuest/i.test(s.name)) ?? sources.find((s) => /EverQuest/i.test(s.name))
  if (eq === undefined) return { error: 'No EverQuest window was found to capture.' }
  const { width, height } = eq.thumbnail.getSize()
  return { name: eq.name, img: bgraToRgba(new Uint8Array(eq.thumbnail.toBitmap()), width, height) }
}

async function capture(): Promise<void> {
  const now = Date.now()
  if (busy || now - last < DEBOUNCE_MS) return
  busy = true
  last = now
  const t0 = performance.now()
  try {
    const got = await grabGame()
    if ('error' in got || got.img === null) {
      keep({ at: new Date().toISOString(), error: 'error' in got ? got.error : 'The capture was empty.', ms: Math.round(performance.now() - t0) })
      return
    }
    const read = await readCapture(got.img, READERS)
    keep({ at: new Date().toISOString(), window: got.name, ms: Math.round(performance.now() - t0), ...(read.reply === undefined ? { error: 'No item window was found in the capture: snip it (Win+Shift+S) and paste it on the row instead.' } : { reply: read.reply }) })
  } catch (e) {
    keep({ at: new Date().toISOString(), error: `Could not capture: ${e instanceof Error ? e.message : String(e)}`, ms: Math.round(performance.now() - t0) })
  } finally {
    busy = false
  }
}

function keep(c: Captured): void {
  waiting.push(c)
  if (waiting.length > KEEP) waiting.splice(0, waiting.length - KEEP)
  const w = getMainWindow()
  if (w && !w.isDestroyed()) w.webContents.send(IPC.onShotCaptured)
}

/** Set (or turn off, null) the hotkey; the answer says what is in force and why a key was refused. */
export function setHotkey(accel: string | null): { hotkey: string | null; message?: string } {
  if (accel === null) {
    if (current !== null) globalShortcut.unregister(current)
    current = null
    setSettings({ hotkey: undefined })
    return { hotkey: null }
  }
  const problem = hotkeyProblem(accel)
  if (problem !== undefined) return { hotkey: current, message: problem }
  if (accel === current) return { hotkey: current }
  let ok = false
  try {
    ok = globalShortcut.register(accel, () => void capture())
  } catch {
    ok = false
  }
  if (!ok) return { hotkey: current, message: `${accel} could not be taken: another program or Windows holds it.` }
  if (current !== null) globalShortcut.unregister(current)
  current = accel
  setSettings({ hotkey: accel })
  return { hotkey: current }
}

export function registerShotCaptureIpc(): void {
  // The key the player set last time, taken again at start; a key now held elsewhere stays off.
  const saved = settings().hotkey
  if (typeof saved === 'string') setHotkey(saved)
  ipcMain.handle(IPC.shotHotkey, (_e, action: unknown, accel: unknown) => {
    if (action === 'set' && (typeof accel === 'string' || accel === null)) return setHotkey(accel)
    return { hotkey: current }
  })
  ipcMain.handle(IPC.shotCaptures, () => waiting.splice(0, waiting.length))
}
