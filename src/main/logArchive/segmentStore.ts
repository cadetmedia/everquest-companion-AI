// main/logArchive/segmentStore.ts — segment files on disk (step 1.1).
//
// One JSON file per segment, `<id>.segment.json`, in a folder the caller passes in (the app's data
// folder in production, ruling 0.2; a temp folder in tests). Writes go through the durable writer,
// so a crash leaves the old file or the new one and never half of either.
//
// AN UNREADABLE FILE IS SKIPPED AND REPORTED, never repaired or deleted: it may be a newer build's
// segment, and an older build has no business touching it.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSegment, type Segment } from '../../shared/logArchive/segment'
import { writeFileDurable } from '../telemetry/durableWrite'

const SUFFIX = '.segment.json'

/** Ids are file names: letters, digits, `_`, `-` and `.` only, so no id can leave the folder. */
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

export interface SkippedFile {
  file: string
  reason: string
}

export interface SegmentListing {
  segments: Segment[]
  skipped: SkippedFile[]
}

export function segmentPath(dir: string, id: string): string {
  if (!SAFE_ID.test(id) || id.startsWith('.')) throw new Error(`unsafe segment id: ${id}`)
  return join(dir, `${id}${SUFFIX}`)
}

function readOne(dir: string, file: string): Segment | SkippedFile {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  } catch (err) {
    return { file, reason: `unreadable: ${(err as Error).message}` }
  }
  const parsed = parseSegment(raw)
  if (!parsed.ok) return { file, reason: parsed.reason }
  if (`${parsed.segment.id}${SUFFIX}` !== file) return { file, reason: 'id does not match file name' }
  return parsed.segment
}

/** Every readable segment in `dir`, optionally only one character's. A missing folder is empty. */
export function listSegments(dir: string, character?: string): SegmentListing {
  const out: SegmentListing = { segments: [], skipped: [] }
  if (!existsSync(dir)) return out
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(SUFFIX)) continue
    const one = readOne(dir, file)
    if ('reason' in one) out.skipped.push(one)
    else if (character === undefined || one.character === character) out.segments.push(one)
  }
  return out
}

/** Write (or replace) one segment, durably. */
export function writeSegment(dir: string, segment: Segment): void {
  writeFileDurable(dir, segmentPath(dir, segment.id), JSON.stringify(segment))
}
