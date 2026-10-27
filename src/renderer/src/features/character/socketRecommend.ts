// character/socketRecommend.ts — THE SOCKET RECOMMENDER, split out of exaltationAudit.ts at the
// measured 400-line file ceiling (split, never ratchet). The audit module keeps the passive
// findings (duplicates, superseded tiers); this one owns the worn BOARD — keeper decision,
// swaps, dead sockets, fills — and every rule the board obeys:
//
//   KEEPER-FIRST (user catch 2026-09-10): one keeper per effect family; only the keeper is
//   offered an upgrade, every other holder is a dead socket. The old order upgraded a socket it
//   also called dead.
//   R2, BOTH HALVES (user ruling 2026-09-10): a gem fits only a host whose cell SLOT its donor
//   states, and only a host whose CLASSES overlap the donor's — socketing re-restricts the host
//   to the donor's classes, so a MNK-only gem needs a monk-capable item. AND THE COMBINED ITEM
//   MUST STILL BE WEARABLE (validator catch 2026-09-25): the overlap the host narrows to has to
//   include a class of the loadout, or the socket makes an item this character cannot wear.
//   NO CROSS-FAMILY EXCHANGE RATE: swaps are same-family only; the one objective cross-family
//   call is replacing a DEAD socket, where anything beats nothing.
//   POOL DISCIPLINE: one physical loose copy is never recommended twice.
//   A PROC IS PER WEAPON (owner correction 2026-09-12): "in force" is judged per BODY for Focus,
//   Click and Worn and per SEAT for Proc — one Lifebite in each hand is two procs. `forceKey`.
//
//   BENEFIT AND LOCKS (Malkil via the owner, 2026-10-26): a gem that helps no class of the loadout
//   is never offered and, socketed, is a dead socket (`noBenefit`); a LOCKED seat is never swapped,
//   replaced or flagged.
//
// Pure and node-tested (tests/exaltationAudit.test.mts drives both modules).

import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation, SheetCellView } from '../../../../shared/characterSheet'
import { ownershipKey } from '../../../../shared/planner/ownership'
import { SLOT_OF_LOCATION } from '../../../../shared/planner/inventorySlots'
import type { EquipLocationToken } from '../../../../shared/outputs/inventory'
import type { EquipSlot } from '../../../../shared/planner/types'
// R2's slot half, corrected 2026-09-10: `donor ∩ hostItem` first, the cell second. Its header
// carries the report and the measurement behind it.
import { narrowedClasses, slotFits } from '../../../../shared/planner/rules'
import { bestEffectFor, helps, usable, type KindEffect, type Loadout } from './exaltationAudit'

// ---- the recommender (the "best with what we have" ask) ----------------------------------------
//
// NOT a proven optimum, and the panel must never claim one. Sockets are scarce and effects are
// not comparable ACROSS families (is Improved Damage III worth more than 41% haste? the corpus
// states no exchange rate), so this is deliberately two honest greedy passes rather than an
// assignment solver over an invented value function:
//
//   SWAPS — a socketed gem is replaced only by a LOOSE copy of the SAME family at a strictly
//   higher tier, usable by the loadout. Same family is what makes "better" a fact instead of a
//   taste; loose is what makes the swap free (a copy socketed elsewhere is already in force).
//
//   FILLS — an open empty socket takes the best remaining loose gem that grants an effect of its
//   kind. Unranked effects fill at tier 0: an effect beats an empty socket, and claims no more.
//
// The pool decrements per physical copy, so one loose gem is never recommended twice.

/** One socket of one WORN item, as the sheet states it — the recommender's board. */
export interface SocketHostCell {
  cellId: string
  cellLabel: string
  item: string
  type: string
  /**
   * The cell's planner slot, or NULL for the two client tokens the wiki cannot name
   * (`Any Slot`, `Held`).
   *
   * A NULL SLOT NO LONGER MEANS "NO SUGGESTIONS" (slot-rule fix, 2026-09-10). R2's slot half is
   * `donor ∩ hostItem`, and the cell is a second constraint on top of it - so an `Any Slot` cell
   * constrains nothing and its HOST still decides. The owner's own dump is the case: two `Any Slot`
   * cells holding ordinary SECONDARY items with seven empty sockets between them, which used to be
   * offered nothing at all. See `shared/planner/rules.ts slotFits`.
   */
  slot: EquipSlot | null
  /** `ownershipKey(item)` — the host item's corpus row, for R2's CLASS half: socketing a
   *  class-restricted gem narrows the host to the donor's classes, so the two must overlap
   *  (user ruling 2026-09-10: a MNK-only gem needs a monk-capable item and makes it MNK-only). */
  itemKey: string
  currentKey: string | null
  currentName: string | null
  /** the player LOCKED today's gem here (Malkil via the owner, 2026-10-26: "this exaltation is
   *  staying, so, figure out the best for the remainder and stop asking me to change it"): no
   *  engine moves, replaces or flags it, and the plan solves around it */
  locked?: boolean
}

export interface SwapRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  fromName: string
  fromEffect: string
  toName: string
  toEffect: string
  /** where the better loose copy sits, in the dump's own words */
  toWhere: string
}

export interface FillRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  gemName: string
  effect: string
  where: string
}

/** A socketed gem whose effect family is ALREADY IN FORCE at a higher (or equal, earlier) tier
 *  elsewhere on the body — same-name effects do not stack, so this socket grants NOTHING. A Proc
 *  gem is never one of these across hands: each weapon fires its own (`forceKey`). */
export interface RedundantRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  name: string
  effect: string
  /** where the copy that actually counts sits, and the effect IT grants (the higher tier -
   *  naming the dead copy's own tier here read as a wrong claim, user report 2026-09-10) */
  keptIn: string
  keptEffect: string
  /** the best loose gem of a family NOT already in force — anything beats a dead socket */
  replaceWith?: { name: string; effect: string; where: string }
  /** set when the gem helps no class of the loadout: what it needs (`FocusBenefit.needs`) */
  noBenefit?: string
}

export interface Recommendations {
  swaps: SwapRec[]
  fills: FillRec[]
  redundant: RedundantRec[]
  /** cellId → the socketed donor keys advice wants OUT — the red flag the grid draws */
  flaggedByCell: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * The recommender's board off the sheet's own cells: one host per STATED socket of every worn
 * item. Iteration, not array combinators, so the domain rows are only ever read (ruling 4).
 */
export function socketHosts(cells: readonly SheetCellView[]): SocketHostCell[] {
  const out: SocketHostCell[] = []
  for (const cell of cells) {
    const item = cell.item
    if (!item) continue
    const slot = SLOT_OF_LOCATION[cell.location as EquipLocationToken] ?? null
    for (const s of item.sockets) {
      out.push({
        cellId: cell.id,
        cellLabel: cell.label,
        item: item.baseName,
        type: s.type,
        slot,
        itemKey: ownershipKey(item.baseName),
        currentKey: s.name === null ? null : ownershipKey(s.name),
        currentName: s.name
      })
    }
  }
  return out
}

/** The spendable pool: loose copies per key, counted, with one representative place each. */
interface LoosePool {
  take: (key: string) => string | undefined
  keys: () => string[]
}

function loosePool(owned: readonly OwnedExaltation[]): LoosePool {
  const counts = new Map<string, { n: number; where: string }>()
  for (const o of owned) {
    if (o.socketed) continue
    const held = counts.get(o.key)
    if (held) held.n += 1
    else counts.set(o.key, { n: 1, where: o.where })
  }
  return {
    take: (key) => {
      const held = counts.get(key)
      if (!held || held.n === 0) return undefined
      held.n -= 1
      return held.where
    },
    keys: () => [...counts.entries()].filter(([, v]) => v.n > 0).map(([k]) => k)
  }
}

/**
 * IS THIS SEAT LIVE AT ALL — the proc rule (owner ruling, kaltinril 2026-09-11).
 *
 * His report: *"it's recommending PROCS in the any slot. I don't think any slot can proc????"*
 *
 * ── WHY R2 LET IT THROUGH, WHICH IS NOT A BUG ─────────────────────────────────────────────────
 *
 * His two `Any Slot` cells hold `Bladestopper +5` and `Shield of Rainbow Hues +6`, both plain
 * SECONDARY items, and `Gold Plated Koshigatana` is a Primary/Secondary weapon - so the pair
 * shares SECONDARY and `seatFits` passes honestly. The client agrees: his dump enumerates a
 * `-Slot10` proc socket on EVERY worn item, ear and face included, so the socket is the game's
 * own and not something this app invented.
 *
 * ── WHY IT IS STILL WRONG ADVICE ──────────────────────────────────────────────────────────────
 *
 * A proc needs something to SWING. An `Any Slot` is a real equipment position, but nothing ever
 * attacks with it - his Bladestopper is a secondary-slot item that is not in his secondary hand
 * (Whitened Treant Fists is). The same argument covers the ear and the chest. So a proc seated
 * anywhere but the two weapon cells can never fire, and offering one spends a gem on nothing.
 *
 * ── THIS IS A RULING, NOT A MEASUREMENT, AND IT SAYS SO ────────────────────────────────────────
 *
 * Nothing in this repo's data states it and his own dump cannot test it: he has only ever socketed
 * procs into Primary and Secondary (Earthshaker and Cherista's Fangs), so there is no non-weapon
 * proc in his log to watch for. He was asked and he ruled. WHAT WOULD OVERTURN IT: socket a proc
 * into an `Any Slot` item and watch for its line in the log - one cast settles it either way.
 *
 * IT GATES WHAT WE OFFER, NOT WHAT HE HAS. A proc already socketed in a non-weapon is left alone
 * rather than called dead; that is a claim about his board and this is a rule about our advice.
 */
export function seatIsLive(seat: Pick<SocketHostCell, 'type' | 'slot'>): boolean {
  if (seat.type !== 'Proc') return true
  return seat.slot === 'PRIMARY' || seat.slot === 'SECONDARY'
}

/**
 * THE KEY ON WHICH "SAME-NAME EFFECTS DO NOT STACK" IS JUDGED (owner correction, kaltinril
 * 2026-09-12: *"You can have 2 procs, one on the primary and one on the secondary and that is
 * fine they will both work"*).
 *
 * The board had called his Secondary's Lifebite a dead socket because Primary already carried
 * one. That is the body-wide rule applied to the one socket kind it does not govern: a Focus,
 * Click or Worn effect is a property of the CHARACTER, so a second copy anywhere on the body
 * grants nothing; a proc is a property of the WEAPON that swings it, and each hand swings its
 * own. Two Lifebites are two procs.
 *
 * So a Proc family is in force PER SEAT and every other kind PER BODY. Both engines ask this one
 * function: the keeper/dead/fill ledger here, the second-hand pass in `socketOptimize`.
 */
export function forceKey(family: string, seat: Pick<SocketHostCell, 'type' | 'cellId'>): string {
  return inForcePerSeat(seat.type) ? `${family}@${seat.cellId}` : family
}

/** The one socket kind whose effect belongs to the seat rather than the body. */
export function inForcePerSeat(type: string): boolean {
  return type === 'Proc'
}

/**
 * CAN THIS DONOR LEGALLY SIT IN THIS SEAT — R2's two halves and the unanswerable-seat guard, in
 * ONE place, for BOTH engines that ask.
 *
 * IT WAS WRITTEN TWICE (owner catch 2026-09-11: *"if they have the same logic they shouldn't
 * duplicate code in 2 places"*). This module had `socketable` + `classesOverlap` and
 * `socketOptimize.ts` had its own `fits`, the same rule spelled out again. That is not a
 * hypothetical drift risk: when the slot half was corrected on 2026-09-10 — `donor ∩ hostItem`
 * first, the cell as a SECOND constraint — BOTH copies had to be found and fixed, and
 * socketOptimize's own header already claimed "the rules are the recommender's" while carrying a
 * private copy of them.
 *
 *   SLOT — `shared/planner/rules.ts slotFits` carries the rule and the measurement behind it.
 *   CLASS — socketing re-restricts the HOST to the donor's classes, so the two must share one.
 *     Either list unstated, or a host the corpus does not know, passes (law 1).
 *   UNANSWERABLE — an `Any Slot` cell whose host the corpus cannot name has no slot on either
 *     side. There is nothing to check against, so it takes nothing rather than everything.
 *   WEARABLE — the class rule was only ever PAIRWISE (validator catch 2026-09-25): this checked
 *     donor ∩ host, `usable` checks donor ∩ loadout, and nothing checked all three. A [ROG,MNK]
 *     gem in a [WAR,ROG] bracer on a [WAR,MNK] character passed both pairs and produced a
 *     ROG-only bracer nobody in the loadout can wear. `narrowedClasses` (rules.ts) is what R2
 *     says the host becomes; given a loadout, that COMBINED list must still meet it.
 *
 * The LOADOUT class gate on the DONOR (`usable`) is still not here: the two engines apply it at
 * different moments — per candidate here, once per claim in the optimizer — and folding it in
 * would make one of them ask it twice. The `loadout` this takes answers a different question:
 * not "can the character use the gem" but "can the character wear the item the gem makes".
 * Without one, or with an empty one, the seat is judged on the two pairs alone.
 */
export function seatFits(
  donor: GearRow,
  seat: Pick<SocketHostCell, 'slot'>,
  hostRow: GearRow | undefined,
  loadout?: Loadout
): boolean {
  const hostSlots = hostRow?.slots ?? []
  if (seat.slot === null && hostSlots.length === 0) return false
  if (!slotFits(donor.slots, hostSlots, seat.slot)) return false
  if (hostRow === undefined || donor.classes.length === 0 || hostRow.classes.length === 0) return true
  // R2's side effect: the host becomes `combined`-only, and THIS character must still wear it.
  const combined = narrowedClasses(hostRow.classes, donor.classes)
  if (combined.length === 0) return false
  if (loadout === undefined || loadout.classes.length === 0) return true
  return combined.some((c) => loadout.classes.includes(c))
}

/**
 * THE HOST AS ITS OTHER SOCKETS LEAVE IT (validator catch 2026-10-01). `seatFits` narrows the
 * BASE host by one donor, but a gem already in - or planned for - another socket of the same item
 * has narrowed it first: a WAR-only gem in an ALL bracer's Focus and a MNK-only gem in its Worn
 * each pass alone for a WAR+MNK loadout, and together leave a bracer nobody can wear. So every
 * engine hands `seatFits` the host narrowed by its siblings' donors. NULL when the siblings
 * already share no class (an empty list would read as "unknown" and pass everything); an
 * unknown host stays unknown (law 1).
 */
export function narrowedHost(
  hostRow: GearRow | undefined,
  siblings: readonly GearRow[]
): GearRow | undefined | null {
  if (hostRow === undefined) return undefined
  let classes = hostRow.classes
  for (const sib of siblings) {
    const next = narrowedClasses(classes, sib.classes)
    if (next.length === 0 && classes.length > 0) return null
    classes = next
  }
  return classes === hostRow.classes ? hostRow : { ...hostRow, classes }
}

/** The recommender's fixed context, bundled once so the lookups keep four parameters. */
interface RecContext {
  pool: LoosePool
  rowByKey: ReadonlyMap<string, GearRow>
  loadout: Loadout
  /** the whole board, so a socket can see its item's other sockets */
  hosts: readonly SocketHostCell[]
  /** `cellId|type` → the donor key this run has advised into that socket */
  planned: Map<string, string>
}

const seatId = (h: Pick<SocketHostCell, 'cellId' | 'type'>): string => `${h.cellId}|${h.type}`

/** The donors the item's OTHER sockets will hold: this run's advice where it gave any, else
 *  whatever sits there today. */
function siblingDonors(ctx: RecContext, host: Pick<SocketHostCell, 'cellId' | 'type'>): GearRow[] {
  const out: GearRow[] = []
  for (const h of ctx.hosts) {
    if (h.cellId !== host.cellId || h.type === host.type) continue
    const key = ctx.planned.get(seatId(h)) ?? h.currentKey
    const row = key === null ? undefined : ctx.rowByKey.get(key)
    if (row !== undefined) out.push(row)
  }
  return out
}

/** The best loose candidate for one socket, under a predicate on its effect. */
function bestLoose(
  ctx: RecContext,
  host: Pick<SocketHostCell, 'cellId' | 'type' | 'slot' | 'itemKey'>,
  accept: (eff: KindEffect) => boolean
): { key: string; row: GearRow; eff: KindEffect } | null {
  if (!seatIsLive(host)) return null
  const hostRow = narrowedHost(ctx.rowByKey.get(host.itemKey), siblingDonors(ctx, host))
  if (hostRow === null) return null
  let best: { key: string; row: GearRow; eff: KindEffect } | null = null
  for (const key of ctx.pool.keys()) {
    const row = ctx.rowByKey.get(key)
    // The loadout gate is this engine's own; the seat gate is the one both engines share.
    if (row === undefined || !usable(row, ctx.loadout) || !seatFits(row, host, hostRow, ctx.loadout)) continue
    const eff = bestEffectFor(row, host.type)
    // A gem that helps no class you play is never offered (owner, 2026-10-26).
    if (eff === null || !helps(eff, ctx.loadout) || !accept(eff)) continue
    if (best === null || eff.tier > best.eff.tier) best = { key, row, eff }
  }
  return best
}

function flag(map: Map<string, Set<string>>, cellId: string, key: string): void {
  const held = map.get(cellId)
  if (held) held.add(key)
  else map.set(cellId, new Set([key]))
}

/** One filled host with the effect its gem currently grants — the keeper board. */
interface EffectiveHost {
  host: SocketHostCell
  eff: KindEffect
  name: string
}

/**
 * KEEPER-FIRST (user catches, kaltinril 2026-09-10: the greedy order recommended upgrading a
 * socket it ALSO called dead, and offered a WAIST gem to a FINGER socket). For each effect
 * family in force, exactly ONE holder is the keeper: the highest current tier, sheet order on
 * ties. Only the keeper is offered a same-family upgrade; every other holder is a dead socket
 * offered a NOT-in-force family. And every suggestion passes R2 — the donor's stated slots
 * must include the destination cell's slot — the same transfer rule the Exaltations browser
 * enforces (`plannerPreset.itemFits`); a cell whose slot the wiki cannot name takes none.
 */
function filledHosts(ctx: RecContext, hosts: readonly SocketHostCell[]): EffectiveHost[] {
  const out: EffectiveHost[] = []
  for (const host of hosts) {
    if (host.currentKey === null) continue
    // A current gem the corpus cannot rank is left alone: "better" would be a guess.
    const cur = bestEffectFor(ctx.rowByKey.get(host.currentKey), host.type)
    if (cur === null) continue
    out.push({ host, eff: cur, name: host.currentName ?? host.currentKey })
  }
  return out
}

function keepersByFamily(effective: readonly EffectiveHost[], loadout: Loadout): Map<string, EffectiveHost> {
  const kept = new Map<string, EffectiveHost>()
  for (const e of effective) {
    // A gem that helps nobody you play keeps nothing in force: it is a dead socket of its own kind.
    if (!helps(e.eff, loadout)) continue
    const key = forceKey(e.eff.family, e.host)
    const held = kept.get(key)
    if (held === undefined || e.eff.tier > held.eff.tier) kept.set(key, e)
  }
  return kept
}

/** The keepers' same-family upgrades from the loose pool, under the R2 slot gate. */
function swapPass(
  ctx: RecContext,
  keepers: ReadonlyMap<string, EffectiveHost>,
  out: { swaps: SwapRec[]; flagged: Map<string, Set<string>> }
): void {
  for (const e of keepers.values()) {
    if (e.host.locked === true) continue
    const better = bestLoose(ctx, e.host, (x) => x.family === e.eff.family && x.tier > e.eff.tier)
    const where = better === null ? undefined : ctx.pool.take(better.key)
    if (better === null || where === undefined) continue
    ctx.planned.set(seatId(e.host), better.key)
    out.swaps.push({
      cellId: e.host.cellId,
      cellLabel: e.host.cellLabel,
      item: e.host.item,
      type: e.host.type,
      fromName: e.name,
      fromEffect: e.eff.effect,
      toName: better.row.name,
      toEffect: better.eff.effect,
      toWhere: where
    })
    if (e.host.currentKey !== null) flag(out.flagged, e.host.cellId, e.host.currentKey)
  }
}

/** Every non-keeper holder is a dead socket, offered a family NOT already in force. */
function redundancyPass(
  ctx: RecContext,
  effective: readonly EffectiveHost[],
  keepers: ReadonlyMap<string, EffectiveHost>,
  out: { redundant: RedundantRec[]; flagged: Map<string, Set<string>>; inForce: Set<string> }
): void {
  for (const e of effective) {
    const keeper = keepers.get(forceKey(e.eff.family, e.host))
    // A locked gem is the player's call, useful or not: never flagged, never replaced.
    if (keeper === e || e.host.locked === true) continue
    out.redundant.push(redundantRec(ctx, e, keeper, out.inForce))
    if (e.host.currentKey !== null) flag(out.flagged, e.host.cellId, e.host.currentKey)
  }
}

function redundantRec(
  ctx: RecContext,
  e: EffectiveHost,
  keptHost: EffectiveHost | undefined,
  inForce: Set<string>
): RedundantRec {
  const repl = bestLoose(ctx, e.host, (x) => !inForce.has(forceKey(x.family, e.host)))
  const where = repl === null ? undefined : ctx.pool.take(repl.key)
  if (repl !== null && where !== undefined) {
    inForce.add(forceKey(repl.eff.family, e.host))
    ctx.planned.set(seatId(e.host), repl.key)
  }
  return {
    cellId: e.host.cellId,
    cellLabel: e.host.cellLabel,
    item: e.host.item,
    type: e.host.type,
    name: e.name,
    effect: e.eff.effect,
    keptIn: keptHost === undefined ? '' : keptHost.host.cellLabel,
    keptEffect: keptHost === undefined ? e.eff.effect : keptHost.eff.effect,
    ...(helps(e.eff, ctx.loadout) || e.eff.benefit === undefined ? {} : { noBenefit: e.eff.benefit.needs }),
    ...(repl === null || where === undefined
      ? {}
      : { replaceWith: { name: repl.row.name, effect: repl.eff.effect, where } })
  }
}

/**
 * Pass 3 — the best remaining loose gems into open empty sockets, SKIPPING ANY FAMILY THE BOARD
 * ALREADY GRANTS.
 *
 * The in-force gate is the fix for a tester's report (Malkil via kaltinril, 2026-09-11): the panel
 * offered him `socket Adamantite Band (Summoning Haste I)` into an empty Fingers Focus while, four
 * lines down, calling that same gem outclassed by a Summoning Haste III he already holds. It was
 * right about the III and wrong to offer the I - same-name effects DO NOT STACK, so that socket
 * would have granted him exactly nothing, which is the very condition the pass above reports as a
 * DEAD SOCKET. This pass was the only one of the three that took `() => true` and asked nothing.
 *
 * THE LEDGER IS SHARED AND IT GROWS, which is the second half of the same bug: two empty sockets
 * used to be offered two different copies of one family, and the second of those is dead on
 * arrival for the same reason. Each fill adds its family before the next host is answered.
 */
function fillPass(
  ctx: RecContext,
  hosts: readonly SocketHostCell[],
  out: { fills: FillRec[]; inForce: Set<string> }
): void {
  for (const host of hosts) {
    if (host.currentKey !== null) continue
    const best = bestLoose(ctx, host, (x) => !out.inForce.has(forceKey(x.family, host)))
    if (best === null) continue
    const where = ctx.pool.take(best.key)
    if (where === undefined) continue
    out.inForce.add(forceKey(best.eff.family, host))
    ctx.planned.set(seatId(host), best.key)
    out.fills.push({
      cellId: host.cellId,
      cellLabel: host.cellLabel,
      item: host.item,
      type: host.type,
      gemName: best.row.name,
      effect: best.eff.effect,
      where
    })
  }
}

/**
 * Keeper decision first, then the greedy passes — keeper upgrades, dead sockets, fills —
 * every suggestion under the R2 slot gate. Hosts arrive in sheet order and are answered in it,
 * so the same dump always yields the same advice.
 */
export function recommendSockets(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  loadout: Loadout,
  hosts: readonly SocketHostCell[]
): Recommendations {
  const ctx: RecContext = {
    pool: loosePool(owned),
    rowByKey: new Map(rows.map((r) => [r.key, r])),
    loadout,
    hosts,
    planned: new Map()
  }
  const swaps: SwapRec[] = []
  const fills: FillRec[] = []
  const redundant: RedundantRec[] = []
  const flagged = new Map<string, Set<string>>()
  const effective = filledHosts(ctx, hosts)
  const keepers = keepersByFamily(effective, loadout)
  // ONE in-force ledger for the whole run, keyed by `forceKey`: the families the board already
  // grants, plus every family this run places. Shared so the three passes cannot contradict each other about what is live -
  // a swap keeps its family in force, a dead socket's replacement claims a new one, and a fill may
  // claim only what neither of them has.
  const inForce = new Set(keepers.keys())
  swapPass(ctx, keepers, { swaps, flagged })
  redundancyPass(ctx, effective, keepers, { redundant, flagged, inForce })
  fillPass(ctx, hosts, { fills, inForce })
  return { swaps, fills, redundant, flaggedByCell: flagged }
}

