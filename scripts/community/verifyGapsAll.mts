// verifyGapsAll.mts — the Gaps checklist's items that reach past one tab: Held now (the inventory
// export main reads, folded with the log as useHeld folds it) and All characters (main's
// gapsCharacters.ts listing and the tab's join, over every character's folded log). verify-gaps.mts
// runs them beside verifyGapsChecks.mts.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { gapHeld, heldLine } from '../../src/shared/gapHeld'
import type { GapRow, GapsSnap } from '../../src/shared/gaps'
import {
  DEFAULT_GAP_DAYS,
  characterGaps,
  cutoffOf,
  joinCharacters,
  otherCharacters,
  otherInputs,
  seenByKey,
  type CharacterGaps,
  type CharacterInputs,
  type JoinedGaps,
  type SavedGaps
} from '../../src/shared/gapsAllCharacters'
import { parseSegment, type Segment } from '../../src/shared/logArchive/segment'
import { heldNow, IS_MOB, type TabView } from './verifyGapsView.mjs'
import { savedGapsOf, type FoldOut } from './verifyGapsFold.mjs'
import { outcome, skip, type Outcome } from './verifyGapsChecks.mjs'

// ---- 10. held now -----------------------------------------------------------------------------

export async function heldCheck(v: TabView, eqRoot: string): Promise<Outcome> {
  const held = await heldNow(eqRoot, v.fold)
  if (held === null) return skip(`no /outputfile inventory export in ${eqRoot}`)
  const items = v.snap.rows.filter((r) => r.domain === 'item')
  const holding = items.flatMap((r) => {
    return gapHeld(r, held.index).map((h) => `${r.name}: ${heldLine(h)}`)
  })
  return outcome(true, [`export ${basename(held.exportPath)}; ${String(holding.length)} of ${String(items.length)} Items rows held`, ...holding])
}

// ---- 17. all characters -------------------------------------------------------------------------

/** The archive's segments as main's `readSegments` reads them (Logs/companion-archive). */
function archiveSegments(logPath: string): Segment[] {
  const dir = join(dirname(logPath), 'companion-archive')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.segment.json'))
    .flatMap((f) => {
      try {
        const p = parseSegment(JSON.parse(readFileSync(join(dir, f), 'utf8')))
        return p.ok && `${p.segment.id}.segment.json` === f ? [p.segment] : []
      } catch {
        return []
      }
    })
}

/** main's `allCharacterGaps`: every character but the attached one, archives folded in, cut at `since`. */
function othersOf(saved: readonly SavedGaps[], segments: readonly Segment[], attached: SavedGaps, since: string | null): CharacterGaps[] {
  return otherCharacters(saved, segments, attached.character).flatMap((id) => {
    const one = characterGaps(id, saved.find((s) => s.character === id) ?? null, segments, since)
    return one === null ? [] : [one]
  })
}

/** useGapsData's join inputs for one attached character: its live inputs, then the others main served. */
function inputsFor(live: FoldOut, others: readonly CharacterGaps[]): CharacterInputs[] {
  const mine: CharacterInputs = { label: live.meta.character, gaps: live.gaps, loot: live.loot, kills: live.kills }
  return [mine, ...otherInputs(others, IS_MOB)]
}

/** A join input's rows (an unreadable state has none) last seen on or after the cut. */
function rowsCut(gaps: unknown, stamp: string): GapRow[] {
  const rows = gaps !== null && typeof gaps === 'object' && Array.isArray((gaps as GapsSnap).rows) ? (gaps as GapsSnap).rows : []
  return rows.filter((r) => r.last === '' || r.last >= stamp)
}

/** Rows each character's own cut holds, by seenBy key, against the join's seenBy. */
function seenByEvidence(joined: JoinedGaps, inputs: readonly CharacterInputs[], stamp: string): { ok: boolean; lines: string[] } {
  const keysOf = inputs.map((c) => new Set(rowsCut(c.gaps, stamp).map(seenByKey)))
  const shared = [...(keysOf[0] ?? [])].filter((k) => keysOf.slice(1).some((s) => s.has(k)))
  const wrong = shared.filter((k) => (joined.seenBy.get(k)?.length ?? 0) < 2)
  const named = [...joined.seenBy].filter(([, who]) => who.length > 1).map(([k, who]) => `${k} <- ${who.join(' + ')}`)
  const lines = [`rows both characters saw: ${String(shared.length)}; seenBy naming both: ${String(named.length)}${named.length > 0 ? ` (${named.slice(0, 6).join('; ')})` : ''}`]
  if (wrong.length > 0) lines.push(`seen by both but seenBy names one: ${wrong.join(', ')}`)
  return { ok: wrong.length === 0, lines }
}

/** A cut at the middle of every row's last sighting, so the window has something to drop. */
function narrowCut(folds: readonly FoldOut[]): { stamp: string; ms: number } {
  const lasts = folds.flatMap((f) => f.gaps.rows.map((r) => r.last)).filter((s) => s !== '').sort()
  const mid = lasts[Math.floor(lasts.length / 2)] ?? '2026-01-01 00:00:00'
  return cutoffOf(0, new Date(mid.replace(' ', 'T')))
}

function windowEvidence(folds: readonly FoldOut[], joinAt: (cut: { stamp: string; ms: number }) => JoinedGaps): { ok: boolean; lines: string[] } {
  const cut = narrowCut(folds)
  const joined = joinAt(cut)
  const rows = joined.gaps?.rows ?? []
  const lateRow = rows.filter((r) => r.last !== '' && r.last < cut.stamp)
  const lateLoot = joined.loot.filter((e) => e.ts < cut.ms)
  const lateKill = Object.values(joined.kills?.mobs ?? {}).filter((k) => k.lastTs < cut.ms)
  const before = folds.reduce((n, f) => n + f.gaps.rows.length, 0)
  const ok = lateRow.length === 0 && lateLoot.length === 0 && lateKill.length === 0 && rows.length < before
  return { ok, lines: [`window cut at ${cut.stamp}: ${String(before)} rows in -> ${String(rows.length)} joined; rows/loot/kills older than the cut left in: ${String(lateRow.length)}/${String(lateLoot.length)}/${String(lateKill.length)}`] }
}

export function allCharactersCheck(live: FoldOut, others: readonly FoldOut[]): Outcome {
  if (others.length === 0) return skip('only one character log in the Logs folder')
  const folds = [live, ...others]
  const saved = folds.map(savedGapsOf)
  const segments = archiveSegments(live.logPath)
  const attached = saved[0]
  const cut = cutoffOf(DEFAULT_GAP_DAYS, new Date(new Date().toDateString()))
  const served = othersOf(saved, segments, attached, cut.stamp)
  const inputs = inputsFor(live, served)
  const joined = joinCharacters(inputs, cut)
  const seen = seenByEvidence(joined, inputs, cut.stamp)
  const window = windowEvidence(folds, (c) => joinCharacters(inputsFor(live, othersOf(saved, segments, attached, c.stamp)), c))
  // The other way round: another character attached, this one served from its save and its archives.
  const flip = saved[1]
  const flipped = othersOf(saved, segments, flip, cut.stamp)
  const lines = [
    `attached ${live.meta.character}; main serves ${served.map((c) => `${c.name} (${String(c.archives)} archives)`).join(', ') || '(none)'}; ${String(segments.length)} archive segments on disk`,
    `last ${String(DEFAULT_GAP_DAYS)} days (from ${cut.stamp}): ${String(joined.gaps?.rows.length ?? 0)} joined rows, ${String(joined.loot.length)} loot, ${String(Object.keys(joined.kills?.mobs ?? {}).length)} mobs killed`,
    ...seen.lines,
    ...window.lines,
    `attached ${flip.name} instead: main serves ${flipped.map((c) => `${c.name} (${String(c.archives)} archives, ${String((c.gaps as GapsSnap | null)?.rows.length ?? 0)} rows)`).join(', ')}`
  ]
  return outcome(served.length === others.length && seen.ok && window.ok, lines)
}
