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

/**
 * The thumbnail a window capture asks for: the largest display at its full pixels (the game's window
 * fits in it on any display; Electron does not say which display another app's window is on), at
 * most `MAX_CAPTURE_PIXELS`, past which the capture comes back empty (review, 2026-10-21).
 */
export const MAX_CAPTURE_PIXELS = 16_000_000
export function captureSize(displays: readonly { size: { width: number; height: number }; scaleFactor: number }[]): { width: number; height: number } {
  const px = displays.map((d) => ({ width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) }))
  const big = px.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a), { width: 1920, height: 1080 })
  const k = Math.min(1, Math.sqrt(MAX_CAPTURE_PIXELS / (big.width * big.height)))
  return { width: Math.floor(big.width * k), height: Math.floor(big.height * k) }
}

/**
 * The game's own window among the capturable ones: titled exactly `EverQuest`. Electron names no
 * window's process, so a title is all there is, and one that merely contains the word (a browser on
 * the wiki, a chat channel) is never taken. The error says what was seen instead.
 */
export function gameWindow<T extends { name: string }>(sources: readonly T[]): T | { error: string } {
  const eq = sources.find((s) => /^EverQuest$/i.test(s.name.trim()))
  if (eq !== undefined) return eq
  const near = sources.filter((s) => /EverQuest/i.test(s.name)).map((s) => `"${s.name}"`)
  if (near.length === 0) return { error: 'No EverQuest window was found to capture.' }
  return { error: `No window titled exactly "EverQuest" was found (seen: ${near.slice(0, 3).join(', ')}): only the game's own window is captured.` }
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
    const reply: ItemShotReply = { read: shot.read, lines: shot.lines, icons: shot.icons, known: shot.known, ms: shot.ms }
    if (shotKind(reply) !== null) windows.push({ reply, box })
  }
  return { windows, ...(windows.length === 0 ? {} : { reply: windows[0].reply, box: windows[0].box }), tried, ms: Math.round(performance.now() - t0) }
}
