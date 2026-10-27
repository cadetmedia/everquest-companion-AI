// character/socketFixed.ts — WHAT THE BOARD OPTIMIZER TAKES AS FIXED before the matching runs
// (Malkil via the owner, 2026-10-26), split out of socketOptimize.ts at its size ceiling:
//
//   LOCKS - "this exaltation is staying, so, figure out the best for the remainder and stop asking me
//     to change it". A locked seat is a placement before the matching starts, its copy is spent, its
//     item is narrowed by it, and a body-wide family it grants is not seated again AT ITS TIER OR
//     BELOW (a copy that would add nothing). A HIGHER tier is still seated: a lock on Affliction
//     Efficiency I never pulls the Affliction Efficiency II that outranks it (probe, 2026-10-26).
//   IDLE GEMS - a socketed gem that helps no class of the loadout ("if you are not a bard, the bard
//     exaltations are useless"): pulled when nothing better is planned in its seat.

import type { GearRow } from '../../../../shared/planner/gear'
import { bestEffectFor, helps, type Loadout } from './exaltationAudit'
import type { Placement } from './socketOptimize'
import { inForcePerSeat, type SocketHostCell } from './socketRecommend'

/** A socketed gem that helps no class of the loadout, with nothing planned in its place: pull it
 *  (owner, 2026-10-26: "if you are not a bard, the bard exaltations are useless"). */
export interface PlanIdle {
  cellId: string
  cellLabel: string
  item: string
  type: string
  gemName: string
  effect: string
  /** what it needs to help (`FocusBenefit.needs`) */
  needs: string
}

/** The seats whose gem the player locked (`SocketHostCell.locked`). */
export function lockedSeats(sockets: readonly SocketHostCell[]): (SocketHostCell & { currentKey: string })[] {
  return sockets.filter((s): s is SocketHostCell & { currentKey: string } => s.locked === true && s.currentKey !== null)
}

/** Each locked item's locked donors: they narrow its classes before the plan names anything. */
export function lockedSeated(sockets: readonly SocketHostCell[], rowByKey: ReadonlyMap<string, GearRow>): Map<string, GearRow[]> {
  const out = new Map<string, GearRow[]>()
  for (const s of lockedSeats(sockets)) {
    const row = rowByKey.get(s.currentKey)
    if (row !== undefined) out.set(s.cellId, [...(out.get(s.cellId) ?? []), row])
  }
  return out
}

/**
 * THE LOCKED SEATS AS PLACEMENTS (Malkil via the owner, 2026-10-26: "this exaltation is staying, so,
 * figure out the best for the remainder"). A lock pins the gem AND, for a body-wide kind, its family
 * up to the locked tier (`families`: family -> that tier): a copy at or below it elsewhere would
 * grant nothing on top of it (a proc stays per weapon). A locked gem that helps nobody still stays;
 * it simply holds no family.
 */
export function lockedPlacements(
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>,
  loadout: Loadout
): { placements: Placement[]; families: Map<string, number> } {
  const placements: Placement[] = []
  const families = new Map<string, number>()
  for (const s of lockedSeats(sockets)) {
    const eff = bestEffectFor(rowByKey.get(s.currentKey), s.type)
    const name = s.currentName ?? s.currentKey
    if (eff !== null && helps(eff, loadout) && !inForcePerSeat(s.type)) {
      families.set(eff.family, Math.max(eff.tier, families.get(eff.family) ?? 0))
    }
    placements.push({
      cellId: s.cellId,
      cellLabel: s.cellLabel,
      item: s.item,
      type: s.type,
      family: eff?.family ?? name.toLowerCase(),
      effect: eff?.effect ?? name,
      tier: eff?.tier ?? 0,
      gemName: name
    })
  }
  return { placements, families }
}

/** Socketed gems that help no class you play, unlocked, with nothing planned in their seat. */
export function idleOf(
  placements: readonly Placement[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>,
  loadout: Loadout
): PlanIdle[] {
  const taken = new Set(placements.map((p) => `${p.cellId}|${p.type}`))
  const out: PlanIdle[] = []
  for (const s of sockets) {
    if (s.currentKey === null || s.locked === true || taken.has(`${s.cellId}|${s.type}`)) continue
    const eff = bestEffectFor(rowByKey.get(s.currentKey), s.type)
    if (eff?.benefit === undefined || helps(eff, loadout)) continue
    out.push({
      cellId: s.cellId,
      cellLabel: s.cellLabel,
      item: s.item,
      type: s.type,
      gemName: s.currentName ?? s.currentKey,
      effect: eff.effect,
      needs: eff.benefit.needs
    })
  }
  return out
}
