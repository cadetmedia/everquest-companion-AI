// fontReaderWorker.ts — the exact-match font reader (shot/fontReader.ts) OFF the main thread. One
// window a worker: 0.05-0.2 s at UI scale 1, about 1 s at 1.5, pure CPU with no await inside, which
// the thread that tails the log cannot spend (perf audit, 2026-10-20: OCR runs in a worker, never on
// main). The atlas is drawn on main (shot/fontAtlas.ts: GDI through koffi, ~25 ms once) and handed
// in, so this thread loads no native code and a terminate can never land inside an FFI call.
//
// It speaks exactly once and exits.

import { parentPort, workerData } from 'node:worker_threads'
import type { FontAtlas } from './shot/fontAtlas'
import { readFont, type FontRead } from './shot/fontReader'
import type { Rgba } from './shot/pixels'

export interface FontReaderJob {
  img: Rgba
  atlas: FontAtlas
}

export interface FontReaderReply {
  read?: FontRead
  error?: string
}

const job = workerData as FontReaderJob
let reply: FontReaderReply
try {
  reply = { read: readFont(job.img, job.atlas) }
} catch (err) {
  reply = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(reply)
