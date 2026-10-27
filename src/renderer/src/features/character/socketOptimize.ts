// character/socketOptimize.ts — THE BOARD OPTIMIZER (user ask, kaltinril 2026-09-10: "using the
// idea of the traveling salesman... find all the slots that have the highest we own, then the
// ones where there is only 1 at that highest, like belt").
//
// WHAT IS OPTIMIZED, AND WHAT IS DELIBERATELY NOT. The objective is the one thing that needs no
// invented exchange rate: place as MANY DISTINCT effect families as legally possible, each at its
// highest owned tier, over the worn board's sockets — a maximum bipartite matching (Kuhn's
// augmenting paths; the board is ~100 sockets and ~40 families, so the classic algorithm is
// instant). Families are seated in tier order, so when two seatings tie on COUNT the higher
// tiers hold the seats. What is NOT decided here is which of two families deserves a CONTESTED
// socket — Burning Affliction III and Summoning Haste III can both only live in a belt's Focus,
// and no corpus states which is worth more. The matching places one (more families beats fewer),
// and the loser is reported as CONTESTED with exactly what beat it where, so the player makes
// the one call only a player can make.
//
// THE RULES ARE THE RECOMMENDER'S (socketRecommend.ts states them): R2 both halves — donor's
// slots must include the destination cell's slot, donor's classes must overlap the host item's —
// the loadout class gate, socket-type match, one physical copy seated once. And a PROC IS PER
// WEAPON (owner correction 2026-09-12): the matching seats each family once, then `secondHand`
// gives a Proc family's spare copy the other hand — only a seat the matching left free, so a
// second Lifebite never costs a distinct family its seat. Socketed copies
// COUNT AS OWNED: the plan is a target layout for everything you have, and the MOVES list is the
// diff from where things sit today. Whether prying a socketed gem out is free, lossy, or
// impossible is a game rule this corpus does not state — the panel says so once.
//
// SINCE 2026-10-26 (Malkil via the owner): a gem that helps no class of the loadout claims nothing
// (`exaltationAudit.helps`), and a LOCKED seat is fixed before the matching (socketFixed.ts).
//
// Pure and node-tested (tests/socketOptimize.test.mts, tests/exaltRecommend.test.mts).

import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation } from '../../../../shared/characterSheet'
import { bestEffectFor, helps, usable, type KindEffect, type Loadout } from './exaltationAudit'
// R2 lives THERE, not here (owner catch 2026-09-11). This file's header has always said "the rules
// are the recommender's"; until now it said so while carrying its own copy of them.
import { inForcePerSeat, narrowedHost, seatFits, seatIsLive, type SocketHostCell } from './socketRecommend'
import { idleOf, lockedPlacements, lockedSeated, lockedSeats, type PlanIdle } from './socketFixed'

/** A donor gem and the socket type it serves. */
interface Donor {
  key: string
  row: GearRow
  type: string
}

/** One family's claim: its best owned tier and the donor gems that carry it. How many copies
 *  each donor has is the ledger's business (`PlanContext.left`), not the claim's. */
interface FamilyClaim {
  family: string
  eff: KindEffect
  /** the donor keys whose best effect of this kind IS this family at the best tier */
  donors: Donor[]
  /** the family's donors BELOW the best tier, each with its own effect: only the second hand
   *  reads them, since a proc fires per weapon whatever tier the other hand holds */
  lower: (Donor & { eff: KindEffect })[]
  gemName: string
}

/** One seat of the plan: which family the matching placed in which socket. */
export interface Placement {
  cellId: string
  cellLabel: string
  item: string
  type: string
  family: string
  effect: string
  tier: number
  gemName: string
}

/** A move the plan implies: the seat's target differs from what sits there today. */
export interface PlanMove {
  cellLabel: string
  item: string
  type: string
  gemName: string
  effect: string
  /** what currently occupies the seat, or null when it is empty */
  replacesName: string | null
  replacesEffect: string | null
}

/** A family the matching could not seat — with the contest spelled out. */
export interface ContestedFamily {
  effect: string
  gemName: string
  /** the seats it could legally take, and the effect the plan put there instead */
  options: { cellLabel: string; type: string; heldBy: string }[]
  /** true when it has NO legal seat at all on the current board */
  noSeat: boolean
}

/** A seat the plan VACATES: its gem's family now lives elsewhere, so leaving it would keep a
 *  duplicate in force (user catch 2026-09-10 — the plan seated a family at a new spot and said
 *  nothing about the old copy still sitting where it was). */
export interface PlanClear {
  cellId: string
  type: string
  cellLabel: string
  item: string
  gemName: string
  effect: string
  movedTo: string
}

export type { PlanIdle }

export interface BoardPlan {
  placements: Placement[]
  moves: PlanMove[]
  clears: PlanClear[]
  contested: ContestedFamily[]
  idle: PlanIdle[]
}

/** Copies per donor key, socketed and loose alike — the plan reseats everything owned — less the
 *  copies LOCKED where they sit: those are spent before the plan starts. */
function copyCounts(owned: readonly OwnedExaltation[], sockets: readonly SocketHostCell[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const o of owned) out.set(o.key, (out.get(o.key) ?? 0) + 1)
  for (const s of lockedSeats(sockets)) out.set(s.currentKey, Math.max(0, (out.get(s.currentKey) ?? 0) - 1))
  return out
}

/**
 * The optimizer's fixed facts plus THE COPY LEDGER every placement spends.
 *
 * "One physical copy seated once" was a counter on the CLAIM (`copies`, summed over every donor
 * of the family and over every effect kind), and the second hand spent it while `placementOf`
 * named whichever donor fit first (validator catch 2026-09-25): Fangs x1 and Claw x1, both
 * Lifebite, two empty Proc seats - the claim had two copies, so the second hand took the other
 * hand, and BOTH seats were named "Fangs". The ledger is per donor KEY: `left` starts at
 * `copyCounts(owned)` and every placement takes one from the donor it names, so a copy that has
 * been named is not there to name again, whichever claim or hand asks.
 */
interface PlanContext {
  rowByKey: ReadonlyMap<string, GearRow>
  /** who wears the board - `seatFits` refuses a seat whose combined item they could not wear */
  loadout: Loadout
  /** copies of each donor key not yet named by a placement */
  left: Map<string, number>
  /** cellId → the donors named into that item's sockets so far: they narrow its classes for the
   *  next socket of the same item (`narrowedHost`) */
  seated: Map<string, GearRow[]>
}

/** Every family's best owned claim. ONE claim per family (user catch 2026-09-10: keyed by
 *  family-and-type, a family could be seated twice through two socket types); its donors carry
 *  the type each serves, and the tier is the best across all of them. */
function familyClaims(
  counts: ReadonlyMap<string, number>,
  rowByKey: ReadonlyMap<string, GearRow>,
  loadout: Loadout,
  types: readonly string[]
): FamilyClaim[] {
  const best = new Map<string, FamilyClaim>()
  for (const [key, n] of counts) {
    const row = rowByKey.get(key)
    if (n === 0 || row === undefined || !usable(row, loadout)) continue
    for (const type of types) {
      const eff = bestEffectFor(row, type)
      // A gem that helps no class you play claims nothing (owner, 2026-10-26).
      if (eff === null || !helps(eff, loadout)) continue
      const held = best.get(eff.family)
      const donor = { key, row, type }
      if (held === undefined || eff.tier > held.eff.tier) {
        // The superseded tier is not dropped: it is the second hand's fallback.
        const lower = held === undefined ? [] : [...held.lower, ...held.donors.map((d) => ({ ...d, eff: held.eff }))]
        best.set(eff.family, { family: eff.family, eff, donors: [donor], lower, gemName: row.name })
      } else if (eff.tier === held.eff.tier) {
        held.donors.push(donor)
      } else {
        held.lower.push({ ...donor, eff })
      }
    }
  }
  // Seated in tier order, so count-ties resolve toward the higher tiers.
  return [...best.values()].sort((a, b) => b.eff.tier - a.eff.tier)
}

/** Can this claim's own donors keep a seat its family ALREADY occupies? The incumbent test. */
function currentSeatExists(
  c: FamilyClaim,
  sockets: readonly SocketHostCell[],
  ctx: PlanContext
): boolean {
  return sockets.some((s) => {
    if (s.currentKey === null || !seatIsLive(s)) return false
    const occ = bestEffectFor(ctx.rowByKey.get(s.currentKey), s.type)
    if (occ?.family !== c.eff.family) return false
    const hostRow = ctx.rowByKey.get(s.itemKey)
    return c.donors.some((d) => d.type === s.type && seatFits(d.row, s, hostRow, ctx.loadout))
  })
}

/** The eligible seat indexes per claim — the bipartite graph's edges, CURRENT SEATS FIRST.
 *  Kuhn tries edges in order, so listing the seats a family already occupies ahead of the rest
 *  makes the matching stable: nothing moves unless moving buys another family a seat (user
 *  review 2026-09-10 — the plan reseated Serpent Sight across the board for no gain). */
function edges(
  claims: readonly FamilyClaim[],
  sockets: readonly SocketHostCell[],
  ctx: PlanContext,
  /** true lists ONLY the locked seats a claim fits - for the contest report, never the matching */
  lockedOnly = false
): number[][] {
  return claims.map((c) => {
    const current: number[] = []
    const empty: number[] = []
    const occupied: number[] = []
    sockets.forEach((s, i) => {
      // A proc seat nothing swings is not a seat (`seatIsLive`), so it never becomes an edge and
      // the matching cannot spend a family on it. A locked seat is taken before the matching runs.
      if (!seatIsLive(s) || (s.locked === true) !== lockedOnly) return
      const hostRow = ctx.rowByKey.get(s.itemKey)
      if (!c.donors.some((d) => d.type === s.type && seatFits(d.row, s, hostRow, ctx.loadout))) return
      const occupant = s.currentKey === null ? null : bestEffectFor(ctx.rowByKey.get(s.currentKey), s.type)
      if (occupant !== null && occupant.family === c.family) current.push(i)
      else if (s.currentKey === null) empty.push(i)
      else occupied.push(i)
    })
    // Current seats, then EMPTY seats, then seats somebody else holds: an augmenting path only
    // displaces an incumbent when no free seat serves, so the plan never shuffles for nothing.
    return [...current, ...empty, ...occupied]
  })
}

/** Kuhn's augmenting path: can claim `u` be seated, evicting and reseating others as needed?
 *  A FREE seat anywhere in `u`'s list is taken before any holder is asked to move: walking the
 *  list in one pass recursed through a held seat listed ahead of a free one, and moved an
 *  incumbent for nothing (validator catch 2026-10-01 - A in the neck, fitting neck and waist; X
 *  fitting back and neck; C fitting back and waist: C took back, X took the neck, and A was sent
 *  to the waist, three moves where C into the waist is one). */
function tryPlace(u: number, adj: readonly number[][], seatOf: number[], seen: boolean[]): boolean {
  const free = adj[u].find((v) => !seen[v] && seatOf[v] === -1)
  if (free !== undefined) {
    seen[free] = true
    seatOf[free] = u
    return true
  }
  for (const v of adj[u]) {
    if (seen[v]) continue
    seen[v] = true
    if (tryPlace(seatOf[v], adj, seatOf, seen)) {
      seatOf[v] = u
      return true
    }
  }
  return false
}

/** The maximum matching: claim index per seat, or -1 where the seat stays free. */
function match(claimCount: number, adj: readonly number[][], seatCount: number): number[] {
  const seatOf = new Array<number>(seatCount).fill(-1)
  for (let u = 0; u < claimCount; u++) {
    tryPlace(u, adj, seatOf, new Array<boolean>(seatCount).fill(false))
  }
  return seatOf
}

/** The matching read the other way: seat index per claim, or -1 when the claim went unseated. */
function placedOf(seatOf: readonly number[], claimCount: number): number[] {
  const placed = new Array<number>(claimCount).fill(-1)
  seatOf.forEach((u, v) => {
    if (u !== -1) placed[u] = v
  })
  return placed
}

/**
 * THE SECOND HAND (owner correction, kaltinril 2026-09-12: *"You can have 2 procs, one on the
 * primary and one on the secondary and that is fine they will both work"*).
 *
 * The matching seats every family ONCE, which is the whole objective for Focus, Click and Worn:
 * a second copy anywhere on the body grants nothing. A proc is the weapon's, not the body's, so
 * a Proc family that owns a spare copy may hold BOTH hands. It gets them here, AFTER the
 * matching and only from the seats the matching left free — the objective is still distinct
 * families, and a second Lifebite must never evict an Earthquake from the other hand. A Proc
 * seat with no free edge simply stays as the matching left it. `socketRecommend.forceKey` is
 * the same rule for the other engine.
 *
 * Whether a spare copy EXISTS is the ledger's answer, not a counter's: `place` names a donor
 * of the claim that fits the seat and still has a copy left, or nothing - so the hand is taken
 * only when there is a copy to put in it, and the placement says which.
 *
 * AND THE SPARE MAY BE A LOWER TIER (reviewer catch 2026-10-09): Lifebite III in the primary and
 * Lifebite II in the secondary both fire, but the claim held only the best tier, so the plan
 * pulled the secondary's Lifebite II and left that hand empty while the recommender filled it.
 * The best tier is offered first, then the family's lower tiers, best first - so the free seats
 * are every live Proc seat, not only the ones the best tier's donors fit.
 */
function secondHand(
  claims: readonly FamilyClaim[],
  sockets: readonly SocketHostCell[],
  seatOf: number[],
  place: (c: FamilyClaim, v: number) => Placement | null
): Placement[] {
  const out: Placement[] = []
  claims.forEach((c, u) => {
    if (!isProcClaim(c) || !seatOf.includes(u)) return
    const tiers = [c, ...lowerTiers(c)]
    sockets.forEach((s, v) => {
      if (seatOf[v] !== -1 || s.locked === true || !inForcePerSeat(s.type) || !seatIsLive(s)) return
      const p = tiers.reduce<Placement | null>((got, k) => got ?? place(k, v), null)
      if (p === null) return
      seatOf[v] = u
      out.push(p)
    })
  })
  return out
}

/** A claim's lower tiers, best first, each as a one-donor claim `placementOf` can name. */
function lowerTiers(c: FamilyClaim): FamilyClaim[] {
  return [...c.lower]
    .sort((a, b) => b.eff.tier - a.eff.tier)
    .map(({ eff, ...d }) => ({ ...c, eff, donors: [d], lower: [], gemName: d.row.name }))
}

/** A claim whose donors serve the one kind `socketRecommend` holds in force per seat. */
function isProcClaim(c: FamilyClaim): boolean {
  return c.donors.some((d) => inForcePerSeat(d.type))
}

/** The seat's placement names the donor that actually FITS it (user catch 2026-09-10: a claim
 *  carried by several donors printed its FIRST donor's name, which read as a SECONDARY-only
 *  shield gem being sent to the neck - the matching had legally seated a different, neck-slot
 *  donor of the same effect, and the label lied about which).
 *
 *  AND, AMONG THE DONORS THAT FIT, THE SEAT'S OWN OCCUPANT FIRST (validator catch 2026-09-25).
 *  Two gems of one effect at one tier are two donors of one claim, and `find` took whichever the
 *  dump listed first - so with Gem A socketed and Gem B loose, a dump that listed B first made
 *  the plan say "socket Gem B replacing Gem A": a swap that buys nothing, and one that came and
 *  went with the ORDER of the dump. The incumbent is a fit like any other; it is simply the fit
 *  that costs no move.
 *
 *  A donor with no copy LEFT in the ledger does not fit, and a seat no donor fits gets NO
 *  placement (null) rather than the claim's name over a copy that is already spoken for. The
 *  host is judged as the donors already named into its other sockets leave it: two gems that
 *  each pass alone may together make an item nobody in the loadout can wear. */
function placementOf(
  claim: FamilyClaim,
  socket: SocketHostCell,
  ctx: PlanContext
): Placement | null {
  const hostRow = narrowedHost(ctx.rowByKey.get(socket.itemKey), ctx.seated.get(socket.cellId) ?? [])
  if (hostRow === null) return null
  const fits = claim.donors.filter(
    (d) => d.type === socket.type && (ctx.left.get(d.key) ?? 0) > 0 && seatFits(d.row, socket, hostRow, ctx.loadout)
  )
  const donor = fits.find((d) => d.key === socket.currentKey) ?? fits[0]
  if (donor === undefined) return null
  ctx.left.set(donor.key, (ctx.left.get(donor.key) ?? 0) - 1)
  ctx.seated.set(socket.cellId, [...(ctx.seated.get(socket.cellId) ?? []), donor.row])
  return {
    cellId: socket.cellId,
    cellLabel: socket.cellLabel,
    item: socket.item,
    type: socket.type,
    family: claim.family,
    effect: claim.eff.effect,
    tier: claim.eff.tier,
    gemName: donor.row.name
  }
}

/** The diff from today's board: seats whose target differs from their occupant. */
function movesOf(
  placements: readonly Placement[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>
): PlanMove[] {
  const byCell = new Map(placements.map((p) => [`${p.cellId}|${p.type}`, p]))
  const out: PlanMove[] = []
  for (const s of sockets) {
    const p = byCell.get(`${s.cellId}|${s.type}`)
    if (p === undefined) continue
    if (s.currentName !== null && p.gemName.toLowerCase() === s.currentName.toLowerCase()) continue
    const curEff = s.currentKey === null ? null : bestEffectFor(rowByKey.get(s.currentKey), s.type)
    out.push({
      cellLabel: s.cellLabel,
      item: s.item,
      type: s.type,
      gemName: p.gemName,
      effect: p.effect,
      replacesName: s.currentName,
      replacesEffect: curEff?.effect ?? null
    })
  }
  return out
}

/** Seats holding a gem whose family the plan put SOMEWHERE ELSE: pull these, or the family is
 *  in force twice and the seat is dead. A seat whose family the plan left in place, or whose
 *  family went unseated entirely, is not a clear - and neither is a seat a placement takes (its
 *  move already says what it replaces) or any Proc seat: a proc fires on its own weapon, so
 *  "it now lives in" the other hand is never a reason to pull it (owner, 2026-10-09: a
 *  Lifebite swapped for Laceration read as a Lifebite gone to waste). */
function clearsOf(
  placements: readonly Placement[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>
): PlanClear[] {
  // A family holds ONE seat, except a Proc family the second hand seated twice.
  const seatsOfFamily = new Map<string, Placement[]>()
  for (const p of placements) seatsOfFamily.set(p.family, [...(seatsOfFamily.get(p.family) ?? []), p])
  const out: PlanClear[] = []
  for (const s of sockets) {
    if (s.currentKey === null || s.currentName === null) continue
    const occ = bestEffectFor(rowByKey.get(s.currentKey), s.type)
    if (occ === null) continue
    const seats = seatsOfFamily.get(occ.family)
    if (seats === undefined || seats.some((p) => p.cellId === s.cellId && p.type === s.type)) continue
    if (inForcePerSeat(s.type) || placements.some((p) => p.cellId === s.cellId && p.type === s.type)) continue
    // The seat that holds the family's best tier: a lock can leave a lower tier beside it.
    const seat = seats.reduce((a, b) => (b.tier > a.tier ? b : a))
    out.push({
      cellId: s.cellId,
      type: s.type,
      cellLabel: s.cellLabel,
      item: s.item,
      gemName: s.currentName,
      effect: occ.effect,
      // The item disambiguates the paired cells: 'Ear (Earring of Bashing)', not 'Ear' twice.
      movedTo: `${seat.cellLabel} (${seat.item})`
    })
  }
  return out
}

/** The unseated claims, each with the seats it could have taken and who holds them in the plan. */
/** The matching's outcome, bundled once so the reporters keep four parameters. */
interface MatchOutcome {
  claims: readonly FamilyClaim[]
  placed: readonly number[]
  adj: readonly number[][]
  sockets: readonly SocketHostCell[]
  /** the plan's ledger after naming - a free option whose copies are all spent says so */
  left: ReadonlyMap<string, number>
  /** per claim, the LOCKED seats it would fit: a contest the player's own lock decided */
  lockedAdj: readonly number[][]
}

/** Who holds seat `v` in the plan, as the contest line reads it. A legal seat a maximum
 *  matching left free was refused at naming: either every copy of the claim's donors is seated
 *  elsewhere, or the gems planned into the item's other sockets narrow it past the loadout. */
function heldByOf(m: MatchOutcome, u: number, v: number, byCell: ReadonlyMap<string, Placement>): string {
  const s = m.sockets[v]
  const held = byCell.get(`${s.cellId}|${s.type}`)
  if (held !== undefined) return s.locked === true ? `${held.effect} (locked)` : held.effect
  const loose = m.claims[u].donors.some((d) => d.type === s.type && (m.left.get(d.key) ?? 0) > 0)
  return loose
    ? 'nothing (beside the gems planned for its other sockets, the item would fit no class you play)'
    : 'nothing (its only copy is seated elsewhere)'
}

function contestedOf(m: MatchOutcome, placements: readonly Placement[]): ContestedFamily[] {
  const byCell = new Map(placements.map((p) => [`${p.cellId}|${p.type}`, p]))
  const out: ContestedFamily[] = []
  for (let u = 0; u < m.claims.length; u++) {
    if (m.placed[u] !== -1) continue
    const options = [...m.adj[u], ...m.lockedAdj[u]].map((v) => ({
      cellLabel: m.sockets[v].cellLabel,
      type: m.sockets[v].type,
      heldBy: heldByOf(m, u, v, byCell)
    }))
    out.push({
      effect: m.claims[u].eff.effect,
      gemName: m.claims[u].gemName,
      options,
      noSeat: options.length === 0
    })
  }
  return out
}

/** One run of the matching, named against its own fresh ledger. */
interface Seating {
  seatOf: number[]
  placed: number[]
  placements: Placement[]
  ctx: PlanContext
}

/** A claim-to-seat edge of the matching: `[claim index, seat index]`. */
type Edge = readonly [number, number]

/** What every run shares, bundled once so the runs keep four parameters. */
interface SeatingInput {
  order: readonly FamilyClaim[]
  sockets: readonly SocketHostCell[]
  base: PlanContext
  owned: readonly OwnedExaltation[]
}

/** Runs past this many refusals stop branching and simply drop the refused edge. */
const SEARCH_BUDGET = 32

/**
 * Match, then name every matched seat against a fresh ledger. `refused` is null when every
 * matched claim got a placement; otherwise it lists the first matched edge the ledger refused,
 * then the earlier edges that spent the copy it needed or narrowed the same item.
 */
function seatOnce(input: SeatingInput, adj: readonly number[][]): { seating: Seating; refused: Edge[] | null } {
  const ctx: PlanContext = {
    ...input.base,
    left: copyCounts(input.owned, input.sockets),
    seated: lockedSeated(input.sockets, input.base.rowByKey)
  }
  const seatOf = match(input.order.length, adj, input.sockets.length)
  const placed = placedOf(seatOf, input.order.length)
  const seating: Seating = { seatOf, placed, placements: [], ctx }
  const named: { edge: Edge; gem: string; cellId: string }[] = []
  for (let u = 0; u < input.order.length; u++) {
    const v = placed[u]
    if (v === -1) continue
    const socket = input.sockets[v]
    const p = placementOf(input.order[u], socket, ctx)
    if (p === null) {
      const gems = new Set(
        input.order[u].donors.filter((d) => d.type === socket.type).map((d) => d.row.name.toLowerCase())
      )
      const rivals = named.filter((n) => gems.has(n.gem) || n.cellId === socket.cellId)
      return { seating, refused: [[u, v], ...rivals.map((n) => n.edge)] }
    }
    named.push({ edge: [u, v], gem: p.gemName.toLowerCase(), cellId: p.cellId })
    seating.placements.push(p)
  }
  return { seating, refused: null }
}

/**
 * ONE COPY, TWO FAMILIES (validator catch 2026-10-01). A gem with a Focus of one family and a
 * Click of another is two claims, and the matching may seat both - one copy in two places. The
 * ledger names it once and the second seat used to be dropped in silence, AFTER the matching had
 * denied that seat to every other family: one ring with Focus and Click, g x1 granting Alpha
 * (focus) and Beta (click), h granting Gamma (focus) - the plan was "Focus: g" alone and h was
 * reported benched, where g in the Click and h in the Focus seats two families.
 *
 * The same refusal covers the item's classes: two gems that each fit a host alone can together
 * narrow it past every class of the loadout, and the second one named is refused.
 *
 * So a refused edge is removed and the matching runs again, until every matched claim places.
 * WHICH edge goes is a choice: the refused one, or an earlier edge that spent the copy (or
 * narrowed the same item). Each is
 * tried (the refused one first, so a tie keeps the higher tier's seat) and the run that seats
 * more families wins. Past `SEARCH_BUDGET` refusals the search stops branching and drops the
 * refused edge alone; every run removes an edge, so it always ends.
 */
function bestSeating(input: SeatingInput, adj: readonly number[][], budget: { runs: number }): Seating {
  const { seating, refused } = seatOnce(input, adj)
  if (refused === null) return seating
  budget.runs--
  const tries = budget.runs > 0 ? refused : refused.slice(0, 1)
  let best = seating
  let bestCount = -1
  for (const [u, v] of tries) {
    const next = adj.map((a, i) => (i === u ? a.filter((x) => x !== v) : a))
    const run = bestSeating(input, next, budget)
    if (run.placements.length > bestCount) {
      best = run
      bestCount = run.placements.length
    }
  }
  return best
}

/** The four transferable socket types, as the sheet spells them. */
const TYPES = ['Focus', 'Click', 'Worn', 'Proc']

/**
 * The whole plan: the matching, the diff from today, and the contests only a player can judge.
 * `sockets` is `socketHosts(sheet.cells)` — every STATED socket of every worn item.
 */
export function planBoard(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  loadout: Loadout,
  sockets: readonly SocketHostCell[]
): BoardPlan {
  const rowByKey = new Map(rows.map((r) => [r.key, r]))
  const ctx: PlanContext = { rowByKey, loadout, left: copyCounts(owned, sockets), seated: lockedSeated(sockets, rowByKey) }
  const locked = lockedPlacements(sockets, rowByKey, loadout)
  // THE INCUMBENT TIEBREAK, third and final form (user reports 2026-09-10, the belt three
  // times). A claim is incumbent only when ITS OWN best-tier donors can KEEP a seat the family
  // already holds — "the family is socketed somewhere" was too coarse: Summoning Haste counted
  // as incumbent through the tier-I gem in a ring that its belt-only tier-III donor cannot use,
  // and outmuscled the belt's true incumbent on a tie. Incumbents-that-can-stay are seated
  // first at equal tier, so a claim can only take a contested seat by OUTRANKING its holder.
  const claims = familyClaims(ctx.left, rowByKey, loadout, TYPES).filter((c) => c.eff.tier > (locked.families.get(c.family) ?? -1))
  const keeps = claims.map((c) => currentSeatExists(c, sockets, ctx))
  const order = claims
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.eff.tier - a.c.eff.tier || Number(keeps[b.i]) - Number(keeps[a.i]))
    .map((x) => x.c)
  const adj = edges(order, sockets, ctx)
  // The contests are the MATCHING's: a spare proc copy going unseated is not one.
  const run = bestSeating({ order, sockets, base: ctx, owned }, adj, { runs: SEARCH_BUDGET })
  const placements = [...locked.placements, ...run.placements]
  placements.push(...secondHand(order, sockets, run.seatOf, (c, v) => placementOf(c, sockets[v], run.ctx)))
  const lockedAdj = edges(order, sockets, ctx, true)
  return {
    placements,
    moves: movesOf(placements, sockets, rowByKey),
    clears: clearsOf(placements, sockets, rowByKey),
    contested: contestedOf({ claims: order, placed: run.placed, adj, sockets, left: run.ctx.left, lockedAdj }, placements),
    idle: idleOf(placements, sockets, rowByKey, loadout)
  }
}
