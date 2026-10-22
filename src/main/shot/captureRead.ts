// captureRead.ts — a capture of the whole EverQuest window -> the item window in it, read (phase 3
// of screenshot to wiki). The yellow tab labels are tried best first (findWindow.ts); the first one
// whose window reads as an item window or a Lore tab is the answer. A yellow word that is not a
// tab (a chat line, a gauge) reads as nothing and the next is tried.
//
// ELECTRON-FREE.

import { shotKind } from '../../shared/itemShotKeep'
import type { ItemShotReply } from '../../shared/itemWindow'
import { tabLabels, windowAround } from './findWindow'
import { cropRgba, type Box, type Rgba } from './pixels'
import { readItemShot, type ShotReaders } from './readItemShot'

/** Labels tried at most: each costs a read (0.5-2 s). */
const TRIES = 4

export interface CaptureRead {
  reply?: ItemShotReply
  /** Where the window was found in the capture. */
  box?: Box
  /** How many candidate labels were read. */
  tried: number
  ms: number
}

export async function readCapture(img: Rgba, readers: ShotReaders): Promise<CaptureRead> {
  const t0 = performance.now()
  let tried = 0
  for (const label of tabLabels(img).slice(0, TRIES)) {
    const box = windowAround(img, label)
    if (box === null) continue
    tried++
    const shot = await readItemShot(cropRgba(img, box), readers)
    const reply: ItemShotReply = { read: shot.read, lines: shot.lines, icons: shot.icons, ms: shot.ms }
    if (shotKind(reply) !== null) return { reply, box, tried, ms: Math.round(performance.now() - t0) }
  }
  return { tried, ms: Math.round(performance.now() - t0) }
}
