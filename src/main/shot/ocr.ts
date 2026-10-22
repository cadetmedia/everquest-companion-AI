// ocr.ts — read the text of a game window, on this machine, with no network and no tokens
// (owner, 2026-10-20). tesseract.js (Apache-2.0) runs its WASM build in a worker thread, so the
// main process only waits; the English data (`@tesseract.js-data/eng`, MIT) is read from disk,
// the LSTM-only `best_int` set the prototype measured (99% of fields at 13 px, 0.25-1.7 s a window).
//
// The worker starts on the first paste (~0.2 s) and stops after a few idle minutes, so a player who
// never pastes pays nothing.

import { dirname, join } from 'node:path'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { grayPng, ocrGray, type Box, type Rgba } from './pixels'

export interface OcrLine {
  text: string
  /** In the source picture's pixels. */
  box: Box
  /**
   * The `Class` or `Race` word's box when the line has one, else the first real word's: OCR reads the
   * icon beside the text as junk (`8 Quest`, `| Class`, and `By Class: ALL` on Lizardman Mystic Scale).
   */
  lead: Box
}

/** A word of two or more letters or digits: not the junk OCR makes of the icon's edge. */
const REAL_WORD = /[A-Za-z0-9]{2}/
/** The words the icon is placed from (readItemShot.ts `iconRegion`). */
const LABEL_WORD = /^(Class|Race)\b/i

/** Upscale for small UI text (prototype: 3x beat 2x on 10 px text). */
const SCALE = 3
const IDLE_MS = 3 * 60_000
/** A read this long is a hung worker: it is stopped and the next read starts a fresh one. */
const READ_TIMEOUT_MS = 60_000

let worker: Promise<Worker> | null = null
let idle: NodeJS.Timeout | null = null

/**
 * The English data's folder, on disk. NO NETWORK (RULES.md rule 15): tesseract.js fetches from its
 * CDN only when `langPath` is empty or a URL (worker-script/index.js, `langPathDownload`); this is
 * always a local path, and a missing package throws here instead of reaching that fallback.
 */
export function langPath(): string {
  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')
}

async function start(): Promise<Worker> {
  // errorHandler: without one, tesseract.js throws a failed job inside the worker's message listener,
  // an uncaught exception in main; with it the job's own promise rejects and the caller answers it.
  const w = await createWorker('eng', 1, { langPath: langPath(), gzip: true, cacheMethod: 'none', errorHandler: () => undefined })
  // One uniform block of text, spaces between columns kept so `Size: MEDIUM   AC: 1` stays one line.
  await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
  return w
}

function touch(): void {
  if (idle !== null) clearTimeout(idle)
  idle = setTimeout(() => void stopOcr(), IDLE_MS)
  idle.unref()
}

export async function stopOcr(): Promise<void> {
  const w = worker
  worker = null
  if (w !== null) await (await w.catch(() => null))?.terminate()
}

/**
 * Tesseract's TSV, one row per word (`level page block par line word left top width height conf
 * text`), joined back into lines in reading order, boxes scaled back by `k`. The TSV and not the
 * `blocks` tree: the tree of a large window overflows the worker's message (Malkil's 642x979 at 3x:
 * "Too many properties to enumerate").
 */
export function linesFromTsv(tsv: string, k: number): OcrLine[] {
  const lines = new Map<string, { words: string[]; x0: number; y0: number; x1: number; y1: number; lead?: Box; label?: Box }>()
  for (const row of tsv.split('\n')) {
    const f = row.split('\t')
    if (f[0] !== '5' || f.length < 12 || f[11].trim() === '') continue
    const [left, top, width, height] = f.slice(6, 10).map(Number)
    const key = f.slice(1, 5).join(':')
    const l = lines.get(key) ?? { words: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    l.words.push(f[11])
    l.x0 = Math.min(l.x0, left)
    l.y0 = Math.min(l.y0, top)
    l.x1 = Math.max(l.x1, left + width)
    l.y1 = Math.max(l.y1, top + height)
    const at = { x: left / k, y: top / k, w: width / k, h: height / k }
    if (l.lead === undefined && REAL_WORD.test(f[11])) l.lead = at
    if (l.label === undefined && LABEL_WORD.test(f[11])) l.label = at
    lines.set(key, l)
  }
  return [...lines.values()].map((l) => {
    const box = { x: l.x0 / k, y: l.y0 / k, w: (l.x1 - l.x0) / k, h: (l.y1 - l.y0) / k }
    return { text: l.words.join(' '), box, lead: l.label ?? l.lead ?? box }
  })
}

/**
 * 3x for small UI text, less for a big window: about 3 megapixels. Malkil's 642x979 window at 1x read
 * `DMG: 90` as `920`; at 2x it reads right.
 */
export function ocrScale(w: number, h: number): number {
  return Math.max(1, Math.min(SCALE, Math.floor(Math.sqrt(3_000_000 / (w * h)))))
}

/**
 * `job`, or a rejection after `ms` with `onLate` run: a hung tesseract worker never holds a caller (and
 * the capture's `busy`) for good (review, 2026-10-21).
 */
export function withTimeout<T>(job: Promise<T>, ms: number, onLate: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onLate()
      reject(new Error(`The text reader did not answer in ${String(Math.round(ms / 1000))} s and was restarted. Try again.`))
    }, ms)
  })
  // A job that fails after the timeout has nobody waiting on it.
  job.catch(() => undefined)
  return Promise.race([job, late]).finally(() => clearTimeout(timer))
}

/** Every text line of the picture, top to bottom, with where it sits. */
export async function readLines(img: Rgba): Promise<OcrLine[]> {
  // A start that failed is forgotten, so the next paste tries again instead of the same rejection.
  const ready = (worker ??= start().catch((e: unknown) => {
    worker = null
    throw e
  }))
  touch()
  const k = ocrScale(img.w, img.h)
  const { w, h, gray } = ocrGray(img, k)
  const read = (async () => (await ready).recognize(grayPng(w, h, gray), {}, { text: false, tsv: true }))()
  const { data } = await withTimeout(read, READ_TIMEOUT_MS, () => void stopOcr())
  return linesFromTsv(data.tsv ?? '', k)
}
