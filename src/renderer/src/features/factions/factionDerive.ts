// factions/factionDerive.ts — everything the table derives per faction once the filters have
// spoken, plus the row-level visibility rules. PURE (no React), node-testable; split out of
// FactionsView.tsx at the measured 400-code-line file ceiling (split, never ratchet).
//
// TWO HALVES, BY COST (owner ask, 2026-10-11: no lag). `deriveRows` walks EVERY faction's quests,
// folding each reward name to its corpus key twice (the gear verdict, the wishlist join) — the
// expensive half, and it ran on every keystroke because the query was one of its filters
// (measured: 65-71 ms on the main thread per key at 185 factions). The query only ever NARROWS a
// faction's work, and every filter is a per-quest AND, so narrowing the already-narrowed work
// gives the same answer: `deriveRows` now runs once per dump, filter click and wishlist change,
// and `narrowDerived` applies the query per keystroke to the VISIBLE rows alone — reusing the
// base row object outright where the query matched the faction name, so a memoized row sees the
// same props and skips its render.

import type { GearRow } from '@shared/planner/gear'
import type { EquipSlot } from '@shared/planner/types'
import type { FactionWork } from './factionQuests'
import type { FactionRowVm, RaceGate } from './useFactionRows'
import { filterWork, rewardKey, wishedRewards, type WorkFilters } from './factionFilters'

/**
 * What the gear index says about the corpus, folded once per fetch: which keys are GEAR at all
 * (any stat or effect — the value signal's judge), and every key's slots (the slot filter's).
 */
export interface GearMaps {
  worthy: ReadonlySet<string>
  slots: ReadonlyMap<string, readonly EquipSlot[]>
}

/**
 * The stat keys that describe an item's PHYSICS rather than its virtue: every rusty weapon has a
 * damage and a delay, and everything on Norrath weighs something. Counting them made a 21-piece
 * newbie junk pile read as "21 gear rewards" (the Emerald Warriors' Items report); an item is
 * GEAR here only for what it adds — a stat, an AC, a save, an effect.
 */
const PHYSICAL_KEYS: ReadonlySet<string> = new Set(['DMG', 'DELAY', 'RANGE', 'WEIGHT'])

export function gearMaps(rows: readonly GearRow[]): GearMaps {
  const worthy = new Set<string>()
  const slots = new Map<string, readonly EquipSlot[]>()
  for (const r of rows) {
    slots.set(r.key, r.slots)
    const statful = Object.entries(r.stats).some(([k, v]) => (v ?? 0) !== 0 && !PHYSICAL_KEYS.has(k))
    if (statful || r.effects.length > 0) worthy.add(r.key)
  }
  return { worthy, slots }
}

/** Keep `n` when the corpus calls it gear and it has not been kept yet. Split from the loops
 *  below at the measured max-depth ceiling; `rewardKey` folds a name the way the index keys. */
function addGearReward(n: string, worthy: ReadonlySet<string>, seen: Set<string>, names: string[]): void {
  const key = rewardKey(n)
  if (seen.has(key) || !worthy.has(key)) return
  seen.add(key)
  names.push(n.replace(/\*+$/, '').trim())
}

/** The distinct gear items one faction's raising AND home-zone quests reward — the value
 *  question is "is working this faction's area worth it", and a Kerra Island page that forgot
 *  to quote its receipt still pays out on Kerra Island. */
function factionGearRewards(work: FactionWork, worthy: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const q of [...work.raise, ...work.nearby]) {
    for (const n of q.rewards) addGearReward(n, worthy, seen, names)
  }
  return names
}

/** Everything the table states per faction once the filters have spoken. */
export interface RowDerived {
  /** the work, narrowed by the class/slot filters — what the counts and the panel draw */
  work: FactionWork | null
  /** the distinct gear items the narrowed raising quests reward */
  gear: string[]
  /** the narrowed rewards that are ON THE WISHLIST — the loud chip */
  wished: string[]
}

export const NO_DERIVED: RowDerived = { work: null, gear: [], wished: [] }

/** The empty don't-care set, one identity — what a narrowing that does not read the marks holds. */
const NO_MARKS: ReadonlySet<string> = new Set()

/** What every derivation joins against: the gear corpus's verdicts and the wishlist's keys. */
export interface DeriveJoins {
  maps: GearMaps
  wishKeys: ReadonlySet<string>
}

/** One faction's work narrowed by `f`, and everything the row states about the result. */
function deriveWork(work: FactionWork, f: WorkFilters, joins: DeriveJoins): RowDerived {
  const narrowed = filterWork(work, f, joins.maps.slots)
  return {
    work: narrowed,
    gear: factionGearRewards(narrowed, joins.maps.worthy),
    wished: wishedRewards(narrowed, joins.wishKeys)
  }
}

/** THE USER'S OWN RULE: a search that matched the FACTION NAME shows the whole faction; any other
 *  match narrows the panel to the quests that carried it (turn-in, reward, quest name, giver,
 *  zone) — so "Pestilence Scythe" expands to exactly the scythe's quest. `q` is lowercased. */
function effectiveQuery(row: FactionRowVm, q: string): string {
  return q !== '' && row.name.toLowerCase().includes(q) ? '' : q
}

/** Per faction id → its filtered work, gear rewards and wishlist hits, in one walk over EVERY
 *  faction — the expensive half (the header). The controller runs it with an empty query. */
export function deriveRows(
  all: readonly FactionRowVm[] | null,
  f: WorkFilters,
  joins: DeriveJoins
): Map<number, RowDerived> {
  const m = new Map<number, RowDerived>()
  const q = f.query.trim().toLowerCase()
  for (const row of all ?? []) {
    if (row.work === null) {
      m.set(row.id, NO_DERIVED)
      continue
    }
    m.set(row.id, deriveWork(row.work, { ...f, query: effectiveQuery(row, q) }, joins))
  }
  return m
}

/** The search's own narrowing, as the panel reads it: the query and its rewards-only scope. */
export type WorkSearch = Pick<WorkFilters, 'query' | 'rewardsOnly'>

/**
 * The per-keystroke half (the header): the base derivation narrowed by the search, for the
 * VISIBLE rows only. An empty query hands the base map back untouched; a name hit hands the
 * row's base entry back by identity; only a quest hit (reward, turn-in, giver, zone, name) pays
 * for a narrowing — and the rows a search shows are exactly the few that hold its match.
 */
export function narrowDerived(
  visible: readonly FactionRowVm[],
  base: ReadonlyMap<number, RowDerived>,
  search: WorkSearch,
  joins: DeriveJoins
): ReadonlyMap<number, RowDerived> {
  const q = search.query.trim().toLowerCase()
  if (q === '') return base
  const onlyQuery: WorkFilters = {
    classes: [],
    slot: 'ANY',
    coinOnly: false,
    query: q,
    rewardsOnly: search.rewardsOnly,
    cleanOnly: false,
    dontCare: NO_MARKS
  }
  const m = new Map<number, RowDerived>()
  for (const row of visible) {
    const b = base.get(row.id) ?? NO_DERIVED
    m.set(row.id, b.work === null || effectiveQuery(row, q) === '' ? b : deriveWork(b.work, onlyQuery, joins))
  }
  return m
}

export interface RowFilters {
  query: string
  /** hide the 0-rows the character has never touched */
  hideUntouched: boolean
  /** hide rows at their own cap (LIVE `toMax <= 0` — the dump's fact plus the log's): done is done */
  hideMaxed: boolean
  /** only factions that GATE a race unlock (`FactionRowVm.unlocks`, the achievements dump) —
   *  settled gates included, because a friend's unlock runs through the same factions */
  unlocksOnly: boolean
  /** …narrowed to gates THIS character has not settled yet (only read while `unlocksOnly`) */
  unlocksPending: boolean
  /** …narrowed to the gates of THESE races, the dump's own names (`RaceUnlockClaim.race`);
   *  empty = any race (only read while `unlocksOnly`) */
  races: readonly string[]
  /** the search reads REWARDS only — the find-the-chain's-final-quest scope */
  rewardsOnly: boolean
}

/** The three sortable columns. Regard sorts the ladder's RANKS, so ties inside one rung stay
 *  grouped and fall back to the name; Standing sorts the live number. */
export type SortKey = 'name' | 'regard' | 'standing'

export interface RowSort {
  key: SortKey
  dir: 'asc' | 'desc'
}

export const DEFAULT_SORT: RowSort = { key: 'standing', dir: 'desc' }

/** One column's natural (ascending) comparison; `visibleRows` applies the direction. */
function compareBy(a: FactionRowVm, b: FactionRowVm, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name)
  if (key === 'regard') return a.tierRank - b.tierRank || b.standing - a.standing || a.name.localeCompare(b.name)
  return a.standing - b.standing || a.name.localeCompare(b.name)
}

/** The gates the hunt is FOR: every race's by default, one race's when a race is picked, and
 *  only the unsettled ones under the still-needed refinement. Both narrowings read the same
 *  list, so "Kerran, still needed" is exactly the Kerran gates this character has yet to earn. */
export function huntedGates(r: FactionRowVm, f: RowFilters): RaceGate[] {
  return r.unlocks.filter(
    (u) => !(f.unlocksPending && u.done) && (f.races.length === 0 || f.races.includes(u.race))
  )
}

export function visibleRows(rows: readonly FactionRowVm[], f: RowFilters, sort: RowSort): FactionRowVm[] {
  const q = f.query.trim().toLowerCase()
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .filter((r) => {
      // The query searches EVERYTHING the row's work would draw — faction, quest names, givers,
      // zones, turn-in items, rewards (`FactionRowVm.searchText`) — so "Talisman of Kejaar"
      // finds Kerra Isle without anyone knowing which faction owns the quest. A live search also
      // OVERRIDES the hide-toggles: the one faction holding the match may be untouched or maxed,
      // and a search whose only answer is hidden reads as no answer at all.
      const gates = huntedGates(r, f)
      if (q !== '') {
        const hay = f.rewardsOnly ? r.rewardText : r.searchText
        return hay.includes(q) && !(f.unlocksOnly && gates.length === 0)
      }
      // The unlocks hunt OVERRIDES the hide-toggles too: a race-gating faction is usually
      // untouched, which is exactly what the default view hides — the race-chip reveal's trap.
      if (f.unlocksOnly) return gates.length > 0
      return !(f.hideUntouched && r.standing === 0) && !(f.hideMaxed && r.toMax <= 0)
    })
    .sort((a, b) => sign * compareBy(a, b, sort.key))
}
