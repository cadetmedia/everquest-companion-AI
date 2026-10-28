// fontWorker.ts — a pasted or captured window read by the font reader on its own worker
// (fontReaderWorker.js, a rollup input beside index.js, as resistTableWorker.js). Null whenever it
// cannot help: off Windows, GDI or Arial missing, the worker failing or slow. The caller then has
// OCR's reading alone, exactly as before the font reader (readItemShot.ts).

import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { FontReaderJob, FontReaderReply } from '../fontReaderWorker'
import { arialAtlas } from './fontAtlas'
import type { FontRead } from './fontReader'
import type { Rgba } from './pixels'

/** A read this long is given up (the slowest fixture, 1.5x, takes about 1-2.5 s). */
const READ_TIMEOUT_MS = 15_000

export function readFontOnWorker(img: Rgba): Promise<FontRead | null> {
  const atlas = arialAtlas()
  if (atlas === null) return Promise.resolve(null)
  return new Promise((resolve) => {
    let worker: Worker
    try {
      const job: FontReaderJob = { img, atlas }
      worker = new Worker(join(__dirname, 'fontReaderWorker.js'), { workerData: job })
    } catch {
      resolve(null)
      return
    }
    let settled = false
    const finish = (read: FontRead | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(read)
      void worker.terminate()
    }
    const timer = setTimeout(() => finish(null), READ_TIMEOUT_MS)
    worker.on('message', (reply: FontReaderReply) => finish(reply.read ?? null))
    worker.on('error', () => finish(null))
    worker.on('exit', () => finish(null))
  })
}
