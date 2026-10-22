// main/logArchive/logPrefix.ts — the identity of the first N bytes of a log (steps 2.1 and 2.2).
//
// A capture is taken at the engine's read position N, and the game only ever appends, so bytes
// [0, N) never change afterwards even while the game keeps writing. Everything here reads exactly
// that prefix: its SHA-256, its head fingerprint and its first and last line stamps.
//
// Streamed, so a 300 MB log costs a second or two of reading and no 300 MB buffer.

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { HEAD_BYTES, logStampKey, type SegmentLog } from '../../shared/logArchive/segment'

/** The stamp of the first line in `text` that has one, or of the last when `fromEnd`. */
export function stampIn(text: string, fromEnd: boolean): string | null {
  const lines = text.split('\n')
  if (fromEnd) lines.reverse()
  for (const line of lines) {
    const key = logStampKey(line)
    if (key !== null) return key
  }
  return null
}

/** How many bytes of the tail are searched for the last stamp. Lines are far shorter than this. */
const TAIL_BYTES = 64 * 1024

/**
 * Hash and stamp the first `bytes` bytes of `path`. Rejects when the file is shorter than that,
 * because then it is not the file that was captured.
 */
export async function readLogPrefix(path: string, bytes: number): Promise<SegmentLog> {
  const whole = createHash('sha256')
  const headBytes = Math.min(HEAD_BYTES, bytes)
  const head: Buffer[] = []
  let headLen = 0
  let tail = Buffer.alloc(0)
  let seen = 0
  if (bytes > 0) {
    for await (const chunk of createReadStream(path, { start: 0, end: bytes - 1 })) {
      const b = chunk as Buffer
      whole.update(b)
      seen += b.length
      if (headLen < headBytes) {
        head.push(b.subarray(0, headBytes - headLen))
        headLen += Math.min(b.length, headBytes - headLen)
      }
      tail = Buffer.concat([tail, b]).subarray(-TAIL_BYTES)
    }
  }
  if (seen !== bytes) throw new Error(`the log is ${seen} bytes, shorter than the ${bytes} captured`)
  const headBuf = Buffer.concat(head)
  return {
    bytes,
    sha256: whole.digest('hex'),
    headBytes,
    headSha256: createHash('sha256').update(headBuf).digest('hex'),
    firstStamp: stampIn(headBuf.toString('latin1'), false) ?? '',
    lastStamp: stampIn(tail.toString('latin1'), true) ?? ''
  }
}
