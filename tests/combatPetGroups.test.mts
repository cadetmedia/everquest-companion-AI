// PET GROUPS — the damage meter's "With its owner" layout (Malkil, 2026-10-21;
// docs/community/plans/2026-10-20-meter-pet-split.md), pinned on the synthetic meter fixture.
//
// What is worth pinning:
//   * CONSERVATION: grouping moves no damage. Every source appears on exactly one line, and the
//     rows' totals sum to the sources' totals.
//   * PAIRING: your pet joins your row; a group-mate's pet joins its charmer's row by the key in its
//     id; a pet with no master row stays a row of its own with its full name.
//   * HONEST LENGTHS: every line's width is its OWN total against the top row's, and the shared bar
//     is the row's total against the top row's. A tiny pair is a tiny bar, whatever its text needs.
//   * NAMES: a paired ally pet drops the `Pet (…) - Owner` wrapper; only that exact shape does.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cat, skill, source, PET, YOU } from './combatMeterFixture.mts'
import { pairedPetLabel, petGroupRows } from '../src/shared/combatPetGroups'
import { groupedPanel, meterPanel } from '../src/renderer/src/features/combat/petRows'
import type { SourceView } from '../src/shared/combat'

function dealt(id: string, name: string, kind: SourceView['kind'], total: number): SourceView {
  return source(id, name, kind, [cat('melee', [skill('Melee', { total, hits: 10, max: total })])])
}

const BOB = dealt('member:bob', 'Bob', 'member', 4000)
const ZOB = dealt('allypet:bob:zobaner', 'Pet (Zobaner) - Bob', 'allyPet', 2000)
const KYLE = dealt('member:kyle', 'Kyle', 'member', 5000)
const GNOMER = dealt('member:gnomer', 'Gnomer', 'other', 60)
const KIB = dealt('allypet:gnomer:kibbit', 'Pet (Kibbit) - Gnomer', 'allyPet', 30)
const STRAY = dealt('allypet:nobody:wolf', 'Pet (a wolf) - Nobody', 'allyPet', 500)

const ALL = [PET, YOU, KYLE, BOB, ZOB, STRAY, GNOMER, KIB]

test('grouping moves no damage: every source on one line, totals conserved', () => {
  const rows = petGroupRows(ALL)
  const ids = rows.flatMap((r) => r.lines.map((l) => l.source.id))
  assert.deepEqual([...ids].sort(), ALL.map((s) => s.id).sort())
  const sum = (xs: number[]): number => xs.reduce((n, x) => n + x, 0)
  assert.equal(sum(rows.map((r) => r.total)), sum(ALL.map((s) => s.total)))
  for (const r of rows) assert.equal(r.total, sum(r.lines.map((l) => l.source.total)))
})

test('your pet joins your row, a group-mate pet joins its charmer, the master is the first line', () => {
  const rows = petGroupRows(ALL)
  const mine = rows.find((r) => r.id === YOU.id)
  assert.deepEqual(mine?.lines.map((l) => l.source.id), [YOU.id, PET.id])
  const bobs = rows.find((r) => r.id === BOB.id)
  assert.deepEqual(bobs?.lines.map((l) => l.source.id), [BOB.id, ZOB.id])
  // an `other` row (the roster never learned Gnomer) is still a master by its id
  assert.deepEqual(rows.find((r) => r.id === GNOMER.id)?.lines.map((l) => l.label), ['Gnomer', 'Kibbit'])
})

test('a pet with no master row stays a row of one, with its full name', () => {
  const rows = petGroupRows(ALL)
  const stray = rows.find((r) => r.id === STRAY.id)
  assert.equal(stray?.lines.length, 1)
  assert.equal(stray?.lines[0].label, 'Pet (a wolf) - Nobody')
  // your pet with no You row in the list (scoped out, or you dealt nothing) is the same
  const alone = petGroupRows([PET, KYLE])
  assert.deepEqual(alone.map((r) => r.lines.length), [1, 1])
})

test('rows rank by combined total and every width is against the top row', () => {
  const rows = petGroupRows(ALL)
  const totals = rows.map((r) => r.total)
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a))
  const top = rows[0].total
  assert.equal(rows[0].pct, 100)
  for (const r of rows) {
    assert.equal(r.pct, (r.total / top) * 100)
    for (const l of r.lines) assert.equal(l.pct, (l.source.total / top) * 100)
  }
  // the tiny pair stays tiny: 90 of 16,000 is well under a percent, its lines smaller still
  const tiny = rows.find((r) => r.id === GNOMER.id)
  assert.ok(tiny && tiny.pct < 1 && tiny.lines.every((l) => l.pct < tiny.pct))
})

test('a row dps is the sum of its sources, which share one elapsed time', () => {
  const mine = petGroupRows(ALL).find((r) => r.id === YOU.id)
  assert.equal(mine?.dps, YOU.dps + PET.dps)
})

test('only the exact `Pet (<pet>) - <Owner>` wrapper is unwrapped, owner case-insensitively', () => {
  assert.equal(pairedPetLabel(ZOB, BOB), 'Zobaner')
  assert.equal(pairedPetLabel(dealt('allypet:bob:x', 'Pet (a fire giant warrior) - bob', 'allyPet', 1), BOB), 'a fire giant warrior')
  assert.equal(pairedPetLabel(dealt('allypet:bob:x', 'Pet (Zobaner) - Robert', 'allyPet', 1), BOB), 'Pet (Zobaner) - Robert')
  assert.equal(pairedPetLabel(PET, YOU), 'Vebarn')
})

test('groupedPanel regroups level 1 only, and leaves the panel alone when off', () => {
  const panel = meterPanel(ALL, false, null)
  assert.equal(groupedPanel(panel, false), panel)
  const on = groupedPanel(panel, true)
  assert.ok(on.level === 1 && on.groups && on.groups.length === 5)
  // a drill is the separate layout's drill: the grouped flag never touches level 2
  const drilled = meterPanel(ALL, false, { entityId: PET.id })
  assert.equal(groupedPanel(drilled, true), drilled)
  assert.ok(drilled.level === 2 && drilled.parent === null)
})
