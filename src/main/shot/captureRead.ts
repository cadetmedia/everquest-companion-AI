// captureRead.ts — a capture of the whole EverQuest window -> the item windows in it, read (phase 3
// of screenshot to wiki). The yellow tab labels are tried best first (findWindow.ts); every one whose
// window reads as an item window or a Lore tab is kept, so two windows open side by side are two
// readings (owner's screenshot, 2026-10-21: Mud Stained Skin Tunic beside Rusty Battle Axe). A yellow
// word that is not a tab (a chat line, a gauge) reads as nothing and the next is tried.
//
// ELECTRON-FREE.

import { shotKind } from '../../shared/itemShotKeep'
import type { ItemShotReply } from '../../shared/itemWindow'
import { tabLabels, windowAround } from './findWindow'
import { cropRgba, type Box, type Rgba } from './pixels'
import { readItemShot, type ShotReaders } from './readItemShot'

/** Labels tried at most: each costs a read (0.5-2 s). */
const TRIES = 4

export interface CaptureWindow {
  reply: ItemShotReply
  /** Where the window was found in the capture. */
  box: Box
}

export interface CaptureRead {
  /** Every item window found, best label first. */
  windows: CaptureWindow[]
  /** The first of them (one window open is the usual case). */
  reply?: ItemShotReply
  box?: Box
  /** How many candidate labels were read. */
  tried: number
  ms: number
}

/** A label inside a window already read is that window's (a second yellow word in it), not another. */
const within = (b: Box, l: Box): boolean => l.x + l.w / 2 >= b.x && l.x + l.w / 2 <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h

export async function readCapture(img: Rgba, readers: ShotReaders): Promise<CaptureRead> {
  const t0 = performance.now()
  let tried = 0
  const windows: CaptureWindow[] = []
  for (const label of tabLabels(img).slice(0, TRIES)) {
    if (windows.some((w) => within(w.box, label))) continue
    const box = windowAround(img, label)
    if (box === null) continue
    tried++
    const shot = await readItemShot(cropRgba(img, box), readers)
    const reply: ItemShotReply = { read: shot.read, lines: shot.lines, icons: shot.icons, ms: shot.ms }
    if (shotKind(reply) !== null) windows.push({ reply, box })
  }
  return { windows, ...(windows.length === 0 ? {} : { reply: windows[0].reply, box: windows[0].box }), tried, ms: Math.round(performance.now() - t0) }
}
