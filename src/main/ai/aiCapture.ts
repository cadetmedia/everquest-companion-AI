// Screen capture for the AI assistant (cadetmedia fork, ported from EQAI): a frozen picture of the
// screen the player is looking at, a full-screen selector to drag a box over it (Esc cancels, a
// click without a drag takes the whole screen), and the box cropped from that same picture, so
// the selection maps 1:1 with no scale drift. Nothing touches the game: pixels only, the way a
// screenshot tool takes them.
//
// THE HOTKEY IS HELD ONLY WHILE THE AI OVERLAY IS OPEN (owner, 2026-10-30). This app otherwise
// registers no system-wide hotkey (the screenshot-to-wiki capture chose a chat macro instead), so
// the overlay arms it when it mounts and it goes with the window; the AI settings can switch it off.

import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, type NativeImage, type WebContents } from 'electron'
import { join } from 'path'
import { IPC } from '../../shared/ipc'
import { settingsStore } from '../store'
import { getOverlayWindow, WEB_PREFERENCES } from '../windows'

export const AI_CAPTURE_HOTKEY = 'CommandOrControl+Shift+A'
/** Longest side sent to a model: enough to read an item window, small enough for every provider. */
const MAX_SIDE = 1600

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

let busy = false

async function grabDisplay(display: Electron.Display): Promise<NativeImage | null> {
  const scale = display.scaleFactor || 1
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
  })
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  return src ? src.thumbnail : null
}

function isRect(v: unknown): v is Rect {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
}

/** Open the selector over `display` showing `image`; resolves with the box (DIP), or null. */
function runSelector(display: Electron.Display, image: string): Promise<Rect | 'all' | null> {
  return new Promise((resolve) => {
    const { x, y, width, height } = display.bounds
    const w = new BrowserWindow({
      x, y, width, height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      resizable: false,
      show: false,
      webPreferences: WEB_PREFERENCES(join(__dirname, '../preload/selector.js'))
    })
    w.setAlwaysOnTop(true, 'screen-saver')
    let settled = false
    const finish = (r: Rect | 'all' | null): void => {
      if (settled) return
      settled = true
      ipcMain.removeHandler(IPC.aiSelectorImage)
      ipcMain.removeListener(IPC.aiSelectorDone, onDone)
      if (!w.isDestroyed()) w.close()
      resolve(r)
    }
    const onDone = (e: Electron.IpcMainEvent, raw: unknown): void => {
      if (e.sender !== w.webContents) return
      finish(raw === 'all' ? 'all' : isRect(raw) ? raw : null)
    }
    ipcMain.handle(IPC.aiSelectorImage, (e) => (e.sender === w.webContents ? image : null))
    ipcMain.on(IPC.aiSelectorDone, onDone)
    w.on('closed', () => finish(null))
    w.once('ready-to-show', () => {
      w.show()
      w.focus()
    })
    const url = process.env.ELECTRON_RENDERER_URL
    if (url) void w.loadURL(`${url}/selector.html`)
    else void w.loadFile(join(__dirname, '../renderer/selector.html'))
  })
}

/** Crop (DIP box on a physical-pixel picture), shrink to MAX_SIDE, and encode as JPEG. */
function cropAndShrink(full: NativeImage, box: Rect | 'all', scale: number): string {
  let img = full
  if (box !== 'all') {
    img = full.crop({
      x: Math.round(box.x * scale),
      y: Math.round(box.y * scale),
      width: Math.max(1, Math.round(box.width * scale)),
      height: Math.max(1, Math.round(box.height * scale))
    })
  }
  const { width, height } = img.getSize()
  const k = Math.min(1, MAX_SIDE / Math.max(width, height))
  if (k < 1) img = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' })
  return `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}`
}

/** The display's picture with the AI overlay out of it (hidden for the shot, then back). */
async function grabWithoutOverlay(display: Electron.Display): Promise<NativeImage> {
  const overlay = getOverlayWindow('ai')
  const hide = overlay !== null && !overlay.isDestroyed() && overlay.isVisible()
  if (hide) overlay.hide()
  try {
    await new Promise((r) => setTimeout(r, 120))
    const full = await grabDisplay(display)
    if (!full || full.isEmpty()) throw new Error('Could not capture the screen.')
    return full
  } finally {
    if (hide && !overlay.isDestroyed()) overlay.showInactive()
  }
}

/** The whole flow; a data URL of the chosen area, or null when the player cancels. */
export async function captureForAi(): Promise<string | null> {
  if (busy) return null
  busy = true
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const full = await grabWithoutOverlay(display)
    const box = await runSelector(display, full.toDataURL())
    if (!box) return null
    if (box !== 'all' && (box.width < 4 || box.height < 4)) return null
    return cropAndShrink(full, box, display.scaleFactor || 1)
  } finally {
    busy = false
  }
}

// ---- the hotkey, armed by the AI overlay while it is open ----------------------------------------

const armed = new Set<WebContents>()

function hotkeyWanted(): boolean {
  return armed.size > 0 && settingsStore.get('aiConfig')?.captureHotkey !== false
}

/** Hold the shortcut exactly while an armed overlay exists and the setting is on. */
export function refreshAiHotkey(): void {
  const held = globalShortcut.isRegistered(AI_CAPTURE_HOTKEY)
  if (hotkeyWanted() && !held) {
    globalShortcut.register(AI_CAPTURE_HOTKEY, () => {
      void captureForAi().then((image) => {
        if (!image) return
        for (const wc of armed) if (!wc.isDestroyed()) wc.send(IPC.aiCaptured, image)
      })
    })
  } else if (!hotkeyWanted() && held) {
    globalShortcut.unregister(AI_CAPTURE_HOTKEY)
  }
}

export function registerAiCaptureIpc(): void {
  app.on('will-quit', () => globalShortcut.unregister(AI_CAPTURE_HOTKEY))
  ipcMain.handle(IPC.aiCapture, async () => {
    try {
      return { image: await captureForAi() }
    } catch (e) {
      return { image: null, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.on(IPC.aiHotkeyArm, (e, on: unknown) => {
    const wc = e.sender
    if (on === true) {
      if (!armed.has(wc)) wc.once('destroyed', () => {
        armed.delete(wc)
        refreshAiHotkey()
      })
      armed.add(wc)
    } else {
      armed.delete(wc)
    }
    refreshAiHotkey()
  })
}
