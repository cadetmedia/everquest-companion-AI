// character/socketDiff.ts — TODAY'S BOARD AGAINST THE RECOMMENDED ONE, seat by seat (Malkil via the
// owner, 2026-10-26: "a toggle ... so you can switch between current and recommended views, with
// changes highlighted (red outline and text for removal, green outline and text for addition)").
//
// The plan (`socketOptimize.planBoard`) says what each seat should hold; this reads it as one
// change per seat, so the grid draws a removed gem red and an added one green and nothing else.
// A seat the plan names no gem for keeps today's gem, unless the plan pulls it (`clears`: its family
// now lives elsewhere; `idle`: it helps no class you play). Pure and node-tested
// (tests/socketDiff.test.mts).

import type { OwnedExaltation } from '../../../../shared/characterSheet'
import { ownershipKey } from '../../../../shared/planner/ownership'
import type { BoardPlan } from './socketOptimize'
import type { SocketHostCell } from './socketRecommend'

/** One seat whose gem changes. `current` null = an empty socket filled; `target` null = a pull. */
export interface SeatChange {
  cellId: string
  type: string
  current: string | null
  target: string | null
  /** the effect the added gem grants there */
  targetEffect?: string
  /** where the added gem comes from, in the dump's words or the seat it leaves */
  targetFrom?: string
  /** why the removed gem goes, when it is not replaced: a sentence for its hover */
  why?: string
}

export interface BoardDiff {
  /** `cellId|type` → the change; seats that keep their gem are absent */
  bySeat: ReadonlyMap<string, SeatChange>
  added: number
  removed: number
}

export const seatKey = (cellId: string, type: string): string => `${cellId}|${type}`

const same = (a: string | null, b: string | null): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/** Where an added gem comes from: a loose copy first (nothing worn moves), else the seat it leaves. */
function fromOf(gem: string, owned: readonly OwnedExaltation[], sockets: readonly SocketHostCell[]): string | undefined {
  const key = ownershipKey(gem)
  const loose = owned.find((o) => !o.socketed && o.key === key)
  if (loose !== undefined) return loose.where
  const seat = sockets.find((s) => s.currentKey === key)
  return seat === undefined ? undefined : `${seat.cellLabel} (${seat.item})`
}

/** Why the plan pulls a seat's gem without replacing it, by seat. */
function pulls(plan: BoardPlan): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of plan.clears) out.set(seatKey(c.cellId, c.type), `Its effect now comes from ${c.movedTo}.`)
  for (const i of plan.idle) out.set(seatKey(i.cellId, i.type), `It only helps ${i.needs}.`)
  return out
}

/** The whole diff: every seat the plan changes, and how many gems go in and come out. */
export function boardDiff(
  plan: BoardPlan,
  sockets: readonly SocketHostCell[],
  owned: readonly OwnedExaltation[]
): BoardDiff {
  const placed = new Map(plan.placements.map((p) => [seatKey(p.cellId, p.type), p]))
  const pulled = pulls(plan)
  const bySeat = new Map<string, SeatChange>()
  let added = 0
  let removed = 0
  for (const s of sockets) {
    const key = seatKey(s.cellId, s.type)
    const p = placed.get(key)
    const why = pulled.get(key)
    const target = p !== undefined ? p.gemName : why !== undefined ? null : s.currentName
    if (same(s.currentName, target)) continue
    const change: SeatChange = { cellId: s.cellId, type: s.type, current: s.currentName, target }
    if (p !== undefined) {
      change.targetEffect = p.effect
      const from = fromOf(p.gemName, owned, sockets)
      if (from !== undefined) change.targetFrom = from
    } else if (why !== undefined) {
      change.why = why
    }
    if (target !== null) added++
    if (s.currentName !== null) removed++
    bySeat.set(key, change)
  }
  return { bySeat, added, removed }
}
