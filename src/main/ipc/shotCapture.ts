// IPC: capturing the EverQuest window (phase 3 of screenshot to wiki; owner, 2026-10-21). Main grabs
// the EverQuest window (the window, not the screen: Electron's desktopCapturer, no cursor), finds the
// item window by its yellow tab label (shot/findWindow.ts), reads it on this machine, and keeps the
// reading for the Gaps tab, which files it on the item's row by name. Nothing touches the game: a
// picture of its window, as a screenshot tool takes one.
//
// Two ways in, one capture (owner: "lets do both? and avoid C", C being a system-wide hotkey, which
// the app no longer registers): (A) the player's social macro says `eqc capture` on the character's
// private eqc channel, and the engine, which reads the live log, reports the line (ownFires.ts); (B)
// the camera button on an overlay. Both pass shared/shotTrigger.ts's gate. The latest Channels line
// is kept too, so the Gaps tab can show the macro with the channel's number.

import { desktopCapturer, ipcMain, screen } from 'electron'
import { IPC } from '../../shared/ipc'
import { CAPTURE_LINE_REGEX, CAPTURE_MARKER, captureGate, channelNumbers, CHANNELS_LINE_REGEX, DEBOUNCE_MS, isCaptureLine, type Captured } from '../../shared/shotTrigger'
import type { AlertDef } from '../../shared/types'
import type { FireMessage } from '../../shared/dataServer/protocol.generated'
import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from '../data/defaultPacks'
import { setOwnFires } from '../dataServer/ownFires'
import { captureSize, gameWindow, readCapture } from '../shot/captureRead'
import { bgraToRgba } from '../shot/pixels'
import { UNRELEASED } from '../unreleased'
import { getMainWindow } from '../windows'
import { READERS } from './shotIpc'

/** Kept until the Gaps tab takes them; the oldest go past this many. */
const KEEP = 20
/** From the macro's line to the picture: the game draws the frame after the hotbar press. */
const MACRO_DELAY_MS = 300

/** The engine's watch for the macro's line. Never in the store, never played (ownFires.ts). */
const MACRO_DEF: AlertDef = {
  id: 'eqc-shot-capture',
  name: `EQ Companion screenshot capture (${CAPTURE_MARKER} on an eqc channel)`,
  enabled: true,
  trigger: { type: 'raw', regex: CAPTURE_LINE_REGEX },
  // Required by the def's shape; a taken fire plays nothing.
  sound: { packId: DEFAULT_ALERT_PACK_ID, soundId: DEFAULT_ALERT_SOUNDS.buffWearsOff },
  cooldownMs: DEBOUNCE_MS
}

/** The engine's watch for the Channels line (/join, /list, login): which number each channel has. */
const CHANNELS_DEF: AlertDef = { ...MACRO_DEF, id: 'eqc-shot-channels', name: 'EQ Companion chat channel numbers', trigger: { type: 'raw', regex: CHANNELS_LINE_REGEX }, cooldownMs: 0 }

/** The latest Channels line's numbers, by channel name. */
let channels: Record<string, number> = {}

const waiting: Captured[] = []
const gate = captureGate()
let busy = false

/** The EverQuest window's picture at its full size (capped, `captureSize`), or why there is none. */
async function grabGame(): Promise<{ name: string; img: ReturnType<typeof bgraToRgba> } | { error: string }> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: captureSize(screen.getAllDisplays()), fetchWindowIcons: false })
  const eq = gameWindow(sources)
  if ('error' in eq) return eq
  const { width, height } = eq.thumbnail.getSize()
  return { name: eq.name, img: bgraToRgba(new Uint8Array(eq.thumbnail.toBitmap()), width, height) }
}

async function capture(via: 'macro' | 'overlay'): Promise<void> {
  const t0 = performance.now()
  const ms = (): number => Math.round(performance.now() - t0)
  busy = true
  try {
    const got = await grabGame()
    if ('error' in got || got.img === null) {
      keep({ at: new Date().toISOString(), via, error: 'error' in got ? got.error : 'The capture was empty.', ms: ms() })
      return
    }
    const read = await readCapture(got.img, READERS)
    if (read.windows.length === 0) keep({ at: new Date().toISOString(), via, window: got.name, ms: ms(), error: 'No item window was found in the capture: snip it (Win+Shift+S) and paste it on the row instead.' })
    // Two windows open side by side are two readings, each filed on its own row.
    for (const w of read.windows) keep({ at: new Date().toISOString(), via, window: got.name, ms: ms(), reply: w.reply })
  } catch (e) {
    keep({ at: new Date().toISOString(), via, error: `Could not capture: ${e instanceof Error ? e.message : String(e)}`, ms: ms() })
  } finally {
    busy = false
  }
}

/** Start a capture unless one is running or one just ran; a macro line must be recent. */
function start(via: 'macro' | 'overlay', lineAt?: number): void {
  if (busy || !gate(Date.now(), lineAt)) return
  if (via === 'overlay') void capture(via)
  else setTimeout(() => void capture(via), MACRO_DELAY_MS)
}

/** The engine's fire for the macro's line: taken (true) and captured; a Channels line kept; any other fire is not ours. */
function takeMacroFire(fire: FireMessage): boolean {
  const seen = fire.rule === CHANNELS_DEF.name ? channelNumbers(fire.message) : null
  if (seen !== null) {
    channels = seen
    return true
  }
  if (fire.rule !== MACRO_DEF.name || !isCaptureLine(fire.message)) return false
  start('macro', fire.at)
  return true
}

function keep(c: Captured): void {
  waiting.push(c)
  if (waiting.length > KEEP) waiting.splice(0, waiting.length - KEEP)
  const w = getMainWindow()
  if (w && !w.isDestroyed()) w.webContents.send(IPC.onShotCaptured)
}

export function registerShotCaptureIpc(): void {
  // The Gaps tab that files a capture is behind the same gate.
  if (UNRELEASED) setOwnFires([MACRO_DEF, CHANNELS_DEF], takeMacroFire)
  ipcMain.on(IPC.shotCaptureNow, () => start('overlay'))
  ipcMain.handle(IPC.shotCaptures, () => waiting.splice(0, waiting.length))
  ipcMain.handle(IPC.shotChannels, () => channels)
}
