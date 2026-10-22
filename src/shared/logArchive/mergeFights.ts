// shared/logArchive/mergeFights.ts — fight summaries across an archive and the live log (step 4.7).
//
// Ruling 0.4: a segment keeps its fights' SUMMARIES, the rows the fight picker lists. The per-fight
// breakdown stays in the archive. So an archived fight is listed and can be opened to its summary
// (step 4.9), and nothing more is claimed about it.
//
// IDS NEVER COLLIDE. The engine names a fight `e<n>`, counted from the start of the log it folded,
// so the first fight of every log is `e1`. An archived fight is re-named `arch:<segment>:<id>`; a
// segment id is unique, so two archives cannot collide either, and no engine id starts `arch:`.
//
// THE LIST STAYS A PAGE. Archived fights fill the slots the live log leaves under `maxSegments`,
// newest first, so "Load more fights" pages from the live log into the archives and a poll never
// carries thousands of rows.

import type { CombatSnapshot, SegmentSummary, SnapshotOpts } from '../combat'

/** A page size no log reaches, so a capture or a refold asks for every fight (step 4.7). The engine
 *  keeps every finalized fight's summary; 6,299 fights measured at 1.6 MB (ruling 0.4). */
export const ALL_FIGHTS = 1_000_000

/** The engine's default page of finalized fights, `ops.rs DEFAULT_MAX_SEGMENTS`. */
const DEFAULT_MAX_SEGMENTS = 100

const PREFIX = 'arch:'

/** True for an id this file minted. */
export function isArchivedFightId(id: string | undefined): boolean {
  return id?.startsWith(PREFIX) === true
}

function isSummary(x: unknown): x is SegmentSummary {
  if (x === null || typeof x !== 'object') return false
  const s = x as Partial<SegmentSummary>
  return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.startTs === 'number'
}

/**
 * What a segment keeps of a combat snapshot's `segments`: every fight, the open one included and
 * stored as finished (its log ends here), and not the whole-zone row, which is not a fight.
 */
export function capturedFights(segments: unknown): SegmentSummary[] {
  if (!Array.isArray(segments)) return []
  return segments.filter(isSummary).flatMap((s) => {
    if (s.kind === 'zone') return []
    return [s.kind === 'current' ? { ...s, kind: 'fight' as const, active: false } : s]
  })
}

/** The file name of an archive path, either slash. */
function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Newest first; one second holds many fights, so the id settles it, as the engine's search does. */
export function byRecency(a: SegmentSummary, b: SegmentSummary): number {
  if (a.startTs !== b.startTs) return b.startTs - a.startTs
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface FightSource {
  id: string
  archivePath: string | null
  fights?: SegmentSummary[]
}

/** Every eligible segment's fights, re-named and marked with their archive, newest first. */
export function archivedFightRows(segments: readonly FightSource[]): SegmentSummary[] {
  const rows = segments.flatMap((seg) => {
    const archive = seg.archivePath === null ? '' : fileName(seg.archivePath)
    return (seg.fights ?? []).map((f) => ({ ...f, id: `${PREFIX}${seg.id}:${f.id}`, archive }))
  })
  return rows.sort(byRecency)
}

/** The engine options for a request that may name an archived fight: the engine has never heard
 *  of one, and asking would only resolve its default fight for nothing. */
export function engineSideOpts(opts: SnapshotOpts): SnapshotOpts {
  return isArchivedFightId(opts.selectedId) ? { ...opts, selectedId: undefined } : opts
}

/**
 * The live snapshot with archived fights after the live ones, up to the page size. An archived
 * selection resolves to its summary in `archivedSelected` and to no breakdown. Without archived
 * rows, or for a caller that did not ask, the same object comes back.
 */
export function withArchivedFights(
  snap: CombatSnapshot,
  rows: readonly SegmentSummary[],
  opts: SnapshotOpts
): CombatSnapshot {
  if (opts.archived !== true || rows.length === 0) return snap
  const liveFights = snap.segments.filter((s) => s.kind === 'fight').length
  const room = Math.max(0, (opts.maxSegments ?? DEFAULT_MAX_SEGMENTS) - liveFights)
  // After the last live fight and before the whole-zone row, which the engine always puts last.
  const cut = snap.segments.findIndex((s) => s.kind === 'zone')
  const at = cut === -1 ? snap.segments.length : cut
  const segments = [...snap.segments.slice(0, at), ...rows.slice(0, room), ...snap.segments.slice(at)]
  if (!isArchivedFightId(opts.selectedId)) return { ...snap, segments }
  const archivedSelected = rows.find((r) => r.id === opts.selectedId)
  return {
    ...snap,
    segments,
    selectedId: opts.selectedId ?? '',
    selected: null,
    ...(snap.timeline === undefined ? {} : { timeline: null }),
    ...(archivedSelected === undefined ? {} : { archivedSelected })
  }
}
