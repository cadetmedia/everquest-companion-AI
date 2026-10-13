// factions/useFactionRows.ts — everything the Factions tab reads, joined into its row model.
//
// THREE SOURCES, ONE ROW. The dump's standings arrive through `ProgressState` (session.ts loads
// and follows the file; `onProgress` is the delivery). The LOG's receipts since that dump arrive
// through `factions:evidence` (main/factionsEvidence.ts) and are applied here per row — the
// numeric `adjusted by N` lines sum onto the dump's number, and a cap line PINS the value at the
// faction's own ceiling or the scale floor whatever the old file said (shared/factionLog.ts
// carries the algebra and its exactness rules). The quest work joins by name (factionQuests.ts).
//
// So the STANDING THE TAB SHOWS IS LIVE: dump + log, not dump alone — with `drift` and `exact`
// carried on the row so the view can say what was corrected and how confidently. Split out of
// FactionsView.tsx at the 400-code-line file ceiling (split, never ratchet).

import { useEffect, useMemo, useState } from 'react'
import { factionNameKey, type FactionStanding } from '@shared/outputs/factions'
import type { RaceUnlockClaim } from '@shared/outputs/achievements'
import type { HeldCounts, ProgressState } from '@shared/types'
import { applyEvidence, type FactionEvidence, type FactionEvidenceReport } from '@shared/factionLog'
import { CONSIDER_FACTION_COLOR, CONSIDER_FACTION_LABEL } from '@shared/considerFaction'
import { rulesOf } from '@shared/unlocks/unlockGraph'
import { FACTION_TIER_FLOORS, factionTier } from './factionTiers'
import { factionWorkIndex, type FactionWork } from './factionQuests'
import { trailingRefresh } from './evidenceRefresh'

/** The dump's floor — the far end every bar is measured from (measured ±2000, factions.ts). */
const SCALE_FLOOR = -2000

export interface FactionRowVm {
  id: number
  name: string
  /** `factionNameKey(name)` — the key quest receipts and the don't-care marks use */
  key: string
  /** the LIVE standing: the dump's number corrected by the log's receipts since the dump */
  standing: number
  /** what the file itself said — the hover's "dump said N" half */
  dumpStanding: number
  /** standing − dumpStanding: what the log moved since the file was written */
  drift: number
  /** false when the log window could not reach back to the dump AND nothing pinned this row */
  exact: boolean
  /** the faction's own ceiling (`dump standing + toMax` — the file's fact, never hardcoded) */
  cap: number
  /** distance from the LIVE standing to the cap — what the maxed filter reads */
  toMax: number
  label: string
  color: string
  /** the rung's position on the ladder, friendliest first (0 = ally) — the Regard sort's axis */
  tierRank: number
  /** the bar, 0–100 from the scale floor to this faction's cap */
  pct: number
  /** everything a search may match, lowercased: the name plus every quest name, giver, zone,
   *  turn-in and reward on this faction's work — "Talisman of Kejaar" finds Kerra Isle */
  searchText: string
  /** the rewards-only haystack: just what this faction's quests GRANT (plus the name) */
  rewardText: string
  /** the quests on record that move this faction (factionQuests.ts), null when none name it */
  work: FactionWork | null
  raiseCount: number
  /**
   * EVERY race this faction gates — from the achievements dump's race-unlock requirements
   * ("Get maximum faction with <this>"). A gate is a fact about the FACTION, so it stays on the
   * row after you have earned it (`done`) — a friend's Kerran still runs through Kerra Isle
   * whatever your own achievements say. Empty without an achievements dump ("we don't know").
   */
  unlocks: RaceGate[]
}

/** One race a faction gates, and whether YOUR side of it is already settled (the race is open,
 *  or this faction's requirement is marked complete). `null` when an achievements dump exists and
 *  says nothing about it — the window's Show filters drop `C` rows, so silence is not "pending". */
export interface RaceGate {
  race: string
  done: boolean | null
}

function addGate(m: Map<string, RaceGate[]>, faction: string, gate: RaceGate): void {
  const key = factionNameKey(faction)
  const list = m.get(key)
  if (list === undefined) m.set(key, [gate])
  else list.push(gate)
}

/**
 * Faction join key (factionNameKey) → every race gated on it, done or still pending.
 *
 * THE GATES ARE THE RULEBOOK'S (shared/unlocks/unlockGraph.ts), so a faction says which race it
 * opens for a player who has never exported achievements; the dump adds only what it alone
 * knows, whether THIS character has settled the gate. A race the dump names and the rulebook
 * does not is still read off the dump.
 */
function unlockNeeds(races: readonly RaceUnlockClaim[] | undefined): Map<string, RaceGate[]> {
  const m = new Map<string, RaceGate[]>()
  const claims = new Map((races ?? []).map((c) => [c.race, c]))
  const dumped = races !== undefined
  for (const rule of rulesOf('race')) {
    const claim = claims.get(rule.name)
    claims.delete(rule.name)
    for (const need of rule.needs) {
      if (need.kind === 'faction') addGate(m, need.subject, { race: rule.name, done: settled(claim, need.subject, dumped) })
    }
  }
  for (const claim of claims.values()) {
    for (const f of claim.factions) {
      addGate(m, f.name, { race: claim.race, done: claim.complete || f.complete })
    }
  }
  return m
}

/** Whether the dump says this gate is settled: the race is open, or that faction line is `C`.
 *  With a dump that left the race or the line out, unknown (null); with no dump, not settled. */
function settled(claim: RaceUnlockClaim | undefined, faction: string, dumped: boolean): boolean | null {
  if (claim === undefined) return dumped ? null : false
  if (claim.complete) return true
  const key = factionNameKey(faction)
  return claim.factions.find((f) => factionNameKey(f.name) === key)?.complete ?? null
}

/** Everything a row is joined against, bundled once per fold (max-params, and it IS one thing). */
interface RowJoins {
  work: Map<string, FactionWork>
  evidence: Map<string, FactionEvidence>
  windowComplete: boolean
  unlocksByName: Map<string, RaceGate[]>
}

/** The ladder as ranks, friendliest first — computed once from the one tier table. */
const TIER_RANK = new Map(FACTION_TIER_FLOORS.map((t, i) => [t.faction, i]))

/** The two search haystacks: everything the work panel would draw, and the rewards alone. */
function haystacksOf(name: string, w: FactionWork | null): { searchText: string; rewardText: string } {
  const parts = [name]
  const rewardParts = [name]
  for (const q of [...(w?.raise ?? []), ...(w?.nearby ?? []), ...(w?.lower ?? [])]) {
    parts.push(q.name, q.giver ?? '', q.startZone ?? '')
    for (const n of q.items) parts.push(n)
    for (const n of q.rewards) {
      parts.push(n)
      rewardParts.push(n)
    }
  }
  return { searchText: parts.join('\n').toLowerCase(), rewardText: rewardParts.join('\n').toLowerCase() }
}

function toRowVm(r: FactionStanding, joins: RowJoins): FactionRowVm {
  const key = factionNameKey(r.name)
  const ev = joins.evidence.get(key)
  const cap = r.standing + r.toMax
  const live =
    ev === undefined
      ? { value: r.standing, drift: 0, exact: true }
      : applyEvidence(r.standing, cap, ev, joins.windowComplete)
  const tier = factionTier(live.value)
  const w = joins.work.get(key) ?? null
  return {
    id: r.id,
    name: r.name,
    key,
    standing: live.value,
    dumpStanding: r.standing,
    drift: live.drift,
    exact: live.exact,
    cap,
    toMax: cap - live.value,
    label: CONSIDER_FACTION_LABEL[tier],
    color: CONSIDER_FACTION_COLOR[tier],
    tierRank: TIER_RANK.get(tier) ?? FACTION_TIER_FLOORS.length,
    pct: Math.max(0, Math.min(100, ((live.value - SCALE_FLOOR) / (cap - SCALE_FLOOR)) * 100)),
    ...haystacksOf(r.name, w),
    work: w,
    raiseCount: w?.raise.length ?? 0,
    unlocks: joins.unlocksByName.get(key) ?? []
  }
}

export interface FactionsData {
  /** null until the first read lands AND while no dump has ever been loaded for this character */
  rows: FactionRowVm[] | null
  /** when this app last read the dump — `OutputKindLine`'s second slot */
  readAt: number | null
  /** the dump's held counts, for the work panel's "you have N" beside each turn-in item */
  held: HeldCounts
  /** the achievements dump's race unlocks, for the race panel; undefined until one is loaded */
  raceUnlocks?: RaceUnlockClaim[]
}

/**
 * The log-evidence report, re-asked when the dump reloads (that resets the window) and, while the
 * tab is open, after the log moves or the window regains focus — a quest hand-in's "standing
 * adjusted" line reaches the row without a tab revisit. The live asks are coalesced
 * (evidenceRefresh.ts) because each one reads the log tail.
 */
function useFactionEvidence(progress: ProgressState | null): FactionEvidenceReport | null {
  const [report, setReport] = useState<FactionEvidenceReport | null>(null)
  const [asks, setAsks] = useState(0)
  const loadedAt = progress?.factionsSource?.loadedAt
  useEffect(() => {
    const refresh = trailingRefresh(() => setAsks((n) => n + 1))
    // The engine's "a module moved" ping is the existing signal that the log has new lines.
    const off = window.eq.onCombatActivity(refresh.nudge)
    window.addEventListener('focus', refresh.nudge)
    return () => {
      refresh.cancel()
      off()
      window.removeEventListener('focus', refresh.nudge)
    }
  }, [])
  useEffect(() => {
    let alive = true
    window.eq
      .factionsEvidence()
      .then((r) => {
        if (alive) setReport(r)
      })
      .catch(() => {
        // A build whose handler is absent (packaged: the gate) or a read that failed — the dump
        // alone is the honest fallback, which is what a null report renders.
        if (alive) setReport(null)
      })
    return () => {
      alive = false
    }
  }, [loadedAt, asks])
  return report
}

/** Everything the tab draws, live on the same push every progress consumer rides. */
export function useFactionData(): FactionsData {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  useEffect(() => {
    let alive = true
    // A push is always the newer snapshot: the initial reply may have been read before it and
    // still land after it, so once a push has arrived the reply is dropped.
    let pushed = false
    window.eq
      .getProgress()
      .then((p) => {
        if (alive && !pushed) setProgress(p)
      })
      .catch(() => {
        // A failed first read leaves the tab empty until the next push, which is what it shows.
      })
    const off = window.eq.onProgress((p) => {
      pushed = true
      setProgress(p)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  const evidence = useFactionEvidence(progress)
  const standings = progress?.factionStandings
  const races = progress?.raceUnlocks
  const rows = useMemo(() => {
    if (standings === undefined) return null
    const byName = new Map<string, FactionEvidence>()
    for (const ev of evidence?.rows ?? []) byName.set(factionNameKey(ev.name), ev)
    const joins: RowJoins = {
      work: factionWorkIndex(),
      evidence: byName,
      windowComplete: evidence?.complete ?? false,
      unlocksByName: unlockNeeds(races)
    }
    return standings.map((r) => toRowVm(r, joins))
  }, [standings, evidence, races])
  return {
    rows,
    readAt: progress?.factionsSource?.readAt ?? null,
    held: progress?.inventory ?? {},
    ...(progress?.raceUnlocks === undefined ? {} : { raceUnlocks: progress.raceUnlocks })
  }
}
