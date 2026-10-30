// The AI capture selector's bridge (cadetmedia fork): the frozen picture to draw over, and the box
// the player drew. Nothing else. Main only answers this window (aiCapture.ts checks the sender).
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { IPC } from '../shared/ipc'

// THE ZOOM PIN, for the cursor ring's reason (preload/cursor.ts): this page's CSS pixels are the
// display's DIP, and main crops with them. A zoom inherited from the main window's text size
// would put the crop somewhere other than the box the player drew.
webFrame.setZoomLevel(0)

export interface SelectorBox {
  x: number
  y: number
  width: number
  height: number
}

const selectorApi = {
  getImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.aiSelectorImage),
  /** A box in page pixels, 'all' for the whole screen, or null to cancel. */
  done: (box: SelectorBox | 'all' | null): void => ipcRenderer.send(IPC.aiSelectorDone, box)
}

export type EqSelectorApi = typeof selectorApi

contextBridge.exposeInMainWorld('eqSelector', selectorApi)
