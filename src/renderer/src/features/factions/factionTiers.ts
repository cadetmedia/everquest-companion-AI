// factions/factionTiers.ts — standing number → /con rung. PURE (no React, no IPC), node-testable.
//
// THE DUMP SAYS A NUMBER AND THE GAME SPEAKS IN RUNGS. `/outputfile faction` states an absolute
// standing in [-2000, 2000] (shared/outputs/factions.ts, measured); what a player actually meets
// in the world is the /con ladder — "kindly considers you", "scowls at you, ready to attack" —
// and the Factions tab draws both, the number for precision and the rung for meaning. The rungs,
// their labels and their palette are the app's ONE ladder (shared/considerFaction.ts), so a chip
// here and a chip on the con card cannot drift apart.
//
// THE FLOORS ARE ASSUMED, NOT MEASURED, and this header is where that assumption lives (the
// CLASS_UNLOCK_TOKEN_ROW discipline): they are the classic-EQ community/emulator thresholds,
// which no Legends dump can confirm or deny by itself — the file states numbers, never rungs.
// What WOULD settle them is a `/con` beside a fresh dump: the con line names the rung and the
// dump names the number, and a pair that disagrees with this table names the exact floor that is
// wrong. Until someone collects those pairs, a chip drawn from this table is the community's
// claim about the game, presented as the rung the number most plausibly means.
//
//   ally          1100 … 2000
//   warmly         750 … 1099
//   kindly         500 …  749
//   amiably        100 …  499
//   indifferent      0 …   99
//   apprehensive  -100 …   -1
//   dubious       -500 … -101
//   threatening   -750 … -501
//   scowls       -2000 … -751

import type { ConsiderFaction } from '@shared/considerFaction'

/** Rung floors, friendliest first: a standing belongs to the first rung whose floor it reaches. */
export const FACTION_TIER_FLOORS: readonly { faction: ConsiderFaction; floor: number }[] = [
  { faction: 'ally', floor: 1100 },
  { faction: 'warmly', floor: 750 },
  { faction: 'kindly', floor: 500 },
  { faction: 'amiably', floor: 100 },
  { faction: 'indifferent', floor: 0 },
  { faction: 'apprehensive', floor: -100 },
  { faction: 'dubious', floor: -500 },
  { faction: 'threatening', floor: -750 },
  // The last floor is the scale's own bottom, so the walk below cannot fall off the table: every
  // in-range standing reaches SOME floor, and an out-of-range one (a format change) still lands
  // on an honest extreme rather than throwing in a render.
  { faction: 'scowls', floor: -2000 }
]

/** The rung a standing most plausibly means — see the header for exactly what is assumed. */
export function factionTier(standing: number): ConsiderFaction {
  for (const { faction, floor } of FACTION_TIER_FLOORS) {
    if (standing >= floor) return faction
  }
  return 'scowls'
}

// ---- the ladder as a strip (owner ask, 2026-10-12: show where a standing sits among the rungs) --

/** The scale's top: the rungs' last ceiling. A faction's own cap can sit below it. */
const SCALE_TOP = 2000

/** One rung as the strip draws it: its range, hostile first. */
export interface TierBand {
  faction: ConsiderFaction
  floor: number
  ceiling: number
}

/** The rungs hostile → friendly, each with the last standing it covers. */
export const TIER_BANDS: readonly TierBand[] = FACTION_TIER_FLOORS.map((t, i) => ({
  faction: t.faction,
  floor: t.floor,
  ceiling: i === 0 ? SCALE_TOP : FACTION_TIER_FLOORS[i - 1].floor - 1
})).reverse()

/**
 * Where a standing sits on a strip of EQUAL-WIDTH bands, 0 to 1. Equal widths because the rungs
 * are not: drawn to scale, scowls would take 31% of the strip and indifferent 2.5%.
 */
export function ladderPosition(standing: number): number {
  const s = Math.max(TIER_BANDS[0].floor, Math.min(SCALE_TOP, standing))
  const i = TIER_BANDS.findIndex((b) => s <= b.ceiling)
  const band = TIER_BANDS[i]
  const within = (s - band.floor) / (band.ceiling + 1 - band.floor)
  return (i + within) / TIER_BANDS.length
}

/** The next rung up and its floor, or null at ally. */
export function nextTier(standing: number): TierBand | null {
  return TIER_BANDS.find((b) => b.floor > standing) ?? null
}
