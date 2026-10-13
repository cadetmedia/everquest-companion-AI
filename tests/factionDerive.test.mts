// The row-visibility rules (renderer/src/features/factions/factionDerive.ts visibleRows), pinned
// around the race-gate hunt: the hunt overrides the hide-toggles, the still-needed refinement
// drops settled gates, and the race picker keeps only the picked races' gates — a faction that
// gates Kerran AND Froglok answers a Kerran hunt, one that gates Froglok alone does not.
//
// And the derivation's two halves (the file's header): `deriveRows` once, `narrowDerived` per
// keystroke — a name hit hands back the base entry BY IDENTITY (the memoized row's contract), a
// quest hit narrows the panel to the quest that carried it, and an empty query is the base map.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SORT,
  deriveRows,
  huntedGates,
  narrowDerived,
  visibleRows,
  type DeriveJoins,
  type RowFilters
} from '../src/renderer/src/features/factions/factionDerive'
import type { FactionQuestRef, FactionWork } from '../src/renderer/src/features/factions/factionQuests'
import type { FactionRowVm, RaceGate } from '../src/renderer/src/features/factions/useFactionRows'

/** A row with only what the visibility rules read; everything else is inert filler. */
function row(id: number, name: string, standing: number, unlocks: RaceGate[] = []): FactionRowVm {
  return {
    id,
    name,
    standing,
    dumpStanding: standing,
    drift: 0,
    exact: true,
    cap: 2000,
    toMax: 2000 - standing,
    label: 'indifferent',
    color: '#888',
    tierRank: 4,
    pct: 50,
    searchText: name.toLowerCase(),
    rewardText: name.toLowerCase(),
    work: null,
    raiseCount: 0,
    unlocks
  }
}

const OFF: RowFilters = {
  query: '',
  hideUntouched: true,
  hideMaxed: true,
  unlocksOnly: false,
  unlocksPending: false,
  races: [],
  rewardsOnly: false
}

const ROWS: readonly FactionRowVm[] = [
  // untouched, gates Kerran (pending) and Froglok (settled)
  row(1, 'Kerra Isle', 0, [
    { race: 'Kerran', done: false },
    { race: 'Froglok', done: true }
  ]),
  // untouched, gates Froglok only (pending)
  row(2, 'Guardians of the Vale', 0, [{ race: 'Froglok', done: false }]),
  // maxed, gates Kerran (settled)
  row(3, 'Kejek Village', 2000, [{ race: 'Kerran', done: true }]),
  // touched, gates nothing
  row(4, 'Merchants of Qeynos', 300)
]

const names = (f: RowFilters): string[] => visibleRows(ROWS, f, { key: 'name', dir: 'asc' }).map((r) => r.name)

test('the default view hides untouched and maxed rows', () => {
  assert.deepEqual(names(OFF), ['Merchants of Qeynos'])
})

test('the race-gate hunt shows every gating faction, settled or not, over the hide-toggles', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true }), ['Guardians of the Vale', 'Kejek Village', 'Kerra Isle'])
})

test('a race pick keeps only the factions gating THAT race', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Kerran'] }), ['Kejek Village', 'Kerra Isle'])
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Froglok'] }), ['Guardians of the Vale', 'Kerra Isle'])
})

test('several picked races are a union', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Kerran', 'Froglok'] }), [
    'Guardians of the Vale',
    'Kejek Village',
    'Kerra Isle'
  ])
})

test('a race pick and still-needed compose: only the unsettled gates of that race count', () => {
  // Kejek Village's Kerran gate is settled; Kerra Isle's is not.
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Kerran'] }), ['Kerra Isle'])
  // Kerra Isle's Froglok gate is settled, so a still-needed Froglok hunt leaves only the Vale.
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Froglok'] }), [
    'Guardians of the Vale'
  ])
})

test('the race pick is only read while the hunt is on — the default view ignores it', () => {
  assert.deepEqual(names({ ...OFF, races: ['Kerran'] }), ['Merchants of Qeynos'])
})

test('a race no faction gates shows an empty table rather than falling back to everything', () => {
  assert.deepEqual(names({ ...OFF, unlocksOnly: true, races: ['Iksar'] }), [])
})

test('a search under a race pick still has to carry a matching gate', () => {
  const f: RowFilters = { ...OFF, unlocksOnly: true, races: ['Kerran'], query: 'vale' }
  assert.deepEqual(names(f), [])
  assert.deepEqual(names({ ...f, query: 'kerra' }), ['Kerra Isle'])
})

test('huntedGates is the one list both refinements read', () => {
  const r = ROWS[0]!
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true }).map((g) => g.race), ['Kerran', 'Froglok'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, unlocksPending: true }).map((g) => g.race), ['Kerran'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, races: ['Froglok'] }).map((g) => g.race), ['Froglok'])
  assert.deepEqual(huntedGates(r, { ...OFF, unlocksOnly: true, unlocksPending: true, races: ['Froglok'] }), [])
})

test('the default sort is standing, biggest first', () => {
  assert.deepEqual(DEFAULT_SORT, { key: 'standing', dir: 'desc' })
})

// ── the two halves ───────────────────────────────────────────────────────────────────────────

function quest(name: string, rewards: string[]): FactionQuestRef {
  return { name, page: name, items: [], rewards }
}

const KERRA_WORK: FactionWork = {
  raise: [quest('Talisman of Kejaar', ['Talisman of Kejaar Kerrath']), quest('Pestilence Scythe', ['Pestilence Scythe'])],
  lower: [],
  nearby: []
}

const JOINS: DeriveJoins = {
  maps: { worthy: new Set(['pestilence scythe']), slots: new Map() },
  wishKeys: new Set()
}

const WORK_ROWS: readonly FactionRowVm[] = [{ ...row(1, 'Kerra Isle', 0), work: KERRA_WORK, raiseCount: 2 }, row(4, 'Merchants of Qeynos', 300)]
const NO_WORK_FILTERS = {
  classes: [],
  slot: 'ANY',
  coinOnly: false,
  query: '',
  rewardsOnly: false,
  cleanOnly: false,
  dontCare: new Set<string>()
} as const

test('narrowDerived: an empty query is the base map itself', () => {
  const base = deriveRows(WORK_ROWS, NO_WORK_FILTERS, JOINS)
  assert.equal(narrowDerived(WORK_ROWS, base, { query: '', rewardsOnly: false }, JOINS), base)
  assert.equal(base.get(1)?.work?.raise.length, 2)
})

test('narrowDerived: a name hit hands back the base entry by identity; a quest hit narrows', () => {
  const base = deriveRows(WORK_ROWS, NO_WORK_FILTERS, JOINS)
  const byName = narrowDerived(WORK_ROWS, base, { query: 'kerra', rewardsOnly: false }, JOINS)
  assert.equal(byName.get(1), base.get(1))
  assert.equal(byName.get(4), base.get(4))
  const byQuest = narrowDerived(WORK_ROWS, base, { query: 'Scythe', rewardsOnly: false }, JOINS)
  assert.notEqual(byQuest.get(1), base.get(1))
  assert.deepEqual(byQuest.get(1)?.work?.raise.map((q) => q.name), ['Pestilence Scythe'])
  assert.deepEqual(byQuest.get(1)?.gear, ['Pestilence Scythe'])
  // The base is untouched by the narrowing — the next keystroke starts from the whole faction.
  assert.equal(base.get(1)?.work?.raise.length, 2)
})

test('narrowDerived: only the visible rows are derived', () => {
  const base = deriveRows(WORK_ROWS, NO_WORK_FILTERS, JOINS)
  const m = narrowDerived([WORK_ROWS[0]], base, { query: 'scythe', rewardsOnly: true }, JOINS)
  assert.deepEqual([...m.keys()], [1])
})
