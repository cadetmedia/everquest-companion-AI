// captureRead.ts — a capture of the whole EverQuest window -> the item windows in it, read (phase 3
// of screenshot to wiki). The yellow tab labels are tried best first (findWindow.ts); every one whose
// window reads as an item window or a Lore tab is kept, so two windows open side by side are two
// readings (owner's screenshot, 2026-10-21: Mud Stained Skin Tunic beside Rusty Battle Axe). Every
// yellow word's own text is read first (a tiny crop, ~10 ms), and only one that says `Description`
// or `Lore` gets the full read: a chat window's title, a map button or a hotbar icon is yellow too,
// and when the full read went to the 4 best-shaped words those took every try (owner's screenshots,
// 2026-10-22: the tabs ranked 10th-11th of 24 and 5th-8th of 19, so nothing was filed).
//
// ELECTRON-FREE.

import { shotKind } from '../../shared/itemShotKeep'
import { editDistance } from '../../shared/itemVocab'
import type { ItemShotReply } from '../../shared/itemWindow'
import { tabLabels, windowAround } from './findWindow'
import { readLines } from './ocr'
import { clipBox, cropRgba, type Box, type Rgba } from './pixels'
import { readItemShot, type ShotReaders } from './readItemShot'

/** Yellow words whose text is read at most: ~10 ms each (0.4-0.8 s for 19-24 on the owner's screenshots). */
const LABELS_MAX = 60
/** Item windows read at most in one capture: each costs a full read (0.5-2 s). */
const WINDOWS_MAX = 10

/** A tab label's text: `Description` or `Lore`, an OCR slip or two allowed. */
export function isTabWord(text: string): boolean {
  const w = text.toLowerCase().replace(/[^a-z]/g, '')
  return editDistance(w, 'description') <= 2 || (w.length >= 3 && editDistance(w, 'lore') <= 1)
}

/** The text of a yellow word, read from the word alone with a little margin. */
async function labelText(img: Rgba, label: Box): Promise<string> {
  const m = Math.ceil(label.h * 0.6)
  const box = clipBox({ x: label.x - m, y: label.y - m, w: label.w + 2 * m, h: label.h + 2 * m }, img.w, img.h)
  return box === null ? '' : (await readLines(cropRgba(img, box))).map((l) => l.text).join(' ')
}

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
  /** How many windows got the full read. */
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
 * The game's own window among the capturable ones: titled exactly `EverQuest Legends` or `EverQuest`. Electron names no
 * window's process, so a title is all there is, and one that merely contains the word (a browser on
 * the wiki, a chat channel) is never taken. The error says what was seen instead.
 */
export function gameWindow<T extends { name: string }>(sources: readonly T[]): T | { error: string } {
  // The Legends client titles its window `EverQuest Legends` (measured, 2026-10-21); the classic client `EverQuest`.
  const eq = sources.find((s) => /^EverQuest(?: Legends)?$/i.test(s.name.trim()))
  if (eq !== undefined) return eq
  const near = sources.filter((s) => /EverQuest/i.test(s.name)).map((s) => `"${s.name}"`)
  if (near.length === 0) return { error: 'No EverQuest window was found to capture.' }
  return { error: `No window titled exactly "EverQuest Legends" or "EverQuest" (seen: ${near.slice(0, 3).join(', ')}).` }
}

/** A label inside a window already read is that window's (a second yellow word in it), not another. */
const within = (b: Box, l: Box): boolean => l.x + l.w / 2 >= b.x && l.x + l.w / 2 <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h

export async function readCapture(img: Rgba, readers: ShotReaders): Promise<CaptureRead> {
  const t0 = performance.now()
  let tried = 0
  const windows: CaptureWindow[] = []
  for (const label of tabLabels(img).slice(0, LABELS_MAX)) {
    if (windows.length >= WINDOWS_MAX) break
    if (windows.some((w) => within(w.box, label))) continue
    if (!isTabWord(await labelText(img, label))) continue
    const box = windowAround(img, label)
    if (box === null) continue
    tried++
    const shot = await readItemShot(cropRgba(img, box), readers)
    const reply: ItemShotReply = { read: shot.read, lines: shot.lines, icons: shot.icons, known: shot.known, ms: shot.ms }
    if (shotKind(reply) !== null) windows.push({ reply, box })
  }
  return { windows, ...(windows.length === 0 ? {} : { reply: windows[0].reply, box: windows[0].box }), tried, ms: Math.round(performance.now() - t0) }
}
