// nameplate.ts — whether a mob picture shows the mob's nameplate (owner, 2026-10-21). Electron-free,
// so it runs under node:test. A nameplate is bright text over a busy scene: OCR of the picture as it
// stands read only noise on the owner's lizardman scout, and read the name at once with everything
// but the near-white pixels blanked. So the picture is read as it is, then as near-white text, then as
// any bright text (a nameplate tinted by its con colour), stopping at the first that names the mob.

import { nameInLines } from '../../shared/mobPicture'
import { readLines } from './ocr'
import type { Rgba } from './pixels'

type Keep = (r: number, g: number, b: number) => boolean

/** Near white: every channel bright, little colour. */
const WHITE: Keep = (r, g, b) => Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 40
/** Any bright text, a tinted nameplate. */
const BRIGHT: Keep = (r, g, b) => Math.max(r, g, b) >= 220

/** The kept pixels black on white, as OCR reads best. */
export function textMask(img: Rgba, keep: Keep): Rgba {
  const data = new Uint8Array(img.w * img.h * 4).fill(255)
  for (let i = 0; i < img.w * img.h; i++) {
    if (keep(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2])) data.fill(0, i * 4, i * 4 + 3)
  }
  return { w: img.w, h: img.h, data }
}

/** Whether the picture shows the mob's name, in any of the three readings. */
export async function showsName(img: Rgba, name: string): Promise<boolean> {
  for (const view of [() => img, () => textMask(img, WHITE), () => textMask(img, BRIGHT)]) {
    if (nameInLines(name, (await readLines(view())).map((l) => l.text))) return true
  }
  return false
}
