// ============================================================================
// A MOB THE ERA RULES PUT OUT OF ERA IS NOT OFFERED (owner, 2026-10-17)
// ============================================================================
//
// The Achievements tab's "Where to go" list offered A Hatebone Drake in The Plane of Hate. Its
// page is `{{FearHateRevamp Era}}`, but the list only asked the ZONE, and the revamp refilled a
// classic zone: Plane of Hate and Plane of Fear are in era, so every revamp mob in them passed.
// The verdict is computed at data build and stored on the mob (`MobEntry.outOfEra`); the plan
// reads only that flag, never a raw banner (a cave bat is bannered Velious and lives in a classic
// zone). The fixtures are hand-made; the drake's numbers are not the catalog's.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mobIndex, worksHere, type ZoneHere } from '../src/shared/achievements/bookRows'
import { metVersion, setMet } from '../src/shared/metInLog'
import { mobOutOfEra } from '../src/shared/mobEra'
import type { MobEntry } from '../src/shared/mobTypes'
import type { BookComponent } from '../src/shared/outputs/achievementBook'
import {
  NO_CAP,
  keptMob,
  planZones,
  slayerMobs,
  slayerTarget,
  targetReach
} from '../src/shared/slayer/slayerPlan'
import { slayerAreas } from '../src/renderer/src/features/slayer/slayerAreas'

/** A one-zone page with `locs` spawn points at the stated `level`; `out` sets the era flag. */
const mob = (name: string, zone: string, [level, locs]: [string, number], out = false): MobEntry => ({
  page: name,
  name,
  level,
  zones: [zone],
  loc: Array.from({ length: locs }, (_, i) => ({ ns: i, ew: i })),
  ...(out ? { outOfEra: true as const } : {})
})

const DRAKES = slayerTarget({
  group: 'Skill',
  achievement: 'Here Be Drakes',
  label: 'Drakes',
  have: 0,
  need: 100
})

const HATE: MobEntry[] = [
  { ...mob('a hatebone drake', 'Plane of Hate', ['60', 3], true), eraTag: 'FearHateRevamp' },
  { ...mob('a hate drake', 'Plane of Hate', ['45-48', 2]), eraTag: 'Hate' },
  // A raw banner alone hides nothing: only the data build's verdict does.
  { ...mob('a lesser drake', 'Plane of Hate', ['40', 1]), eraTag: 'Velious' },
  mob('a wrath drake', 'Plane of Hate', ['42-44', 4]),
  { ...mob('a fearbone drake', 'Plane of Fear', ['58', 5], true), eraTag: 'FearHateRevamp' }
]
// No race: every one of them is read off its name (`drake`).
const HATE_MOBS = slayerMobs(HATE, () => undefined)

const IN_ERA = { maxLevel: null, outOfEra: false, noFactionHits: false }
const EVERY_ERA = { ...IN_ERA, outOfEra: true }

test('the flag decides, absent is in era, and a banner without the flag hides nothing', () => {
  assert.deepEqual(
    HATE.map((m) => [m.name, mobOutOfEra(m)]),
    [
      ['a hatebone drake', true],
      ['a hate drake', false],
      ['a lesser drake', false],
      ['a wrath drake', false],
      ['a fearbone drake', true]
    ]
  )
  assert.deepEqual(
    HATE_MOBS.map((m) => mobOutOfEra(m.entry)),
    [true, false, false, false, true]
  )
})

test('a flagged mob in a classic zone is not offered, and its zone counts only what is kept', () => {
  const zones = planZones(HATE_MOBS, [DRAKES], IN_ERA)
  assert.deepEqual(
    zones.map((z) => z.short),
    ['hateplane'],
    'Plane of Fear held only a flagged drake, so it drops out'
  )
  const [hate] = zones
  assert.deepEqual(hate.mobs.map((m) => m.name).sort(), ['a hate drake', 'a lesser drake', 'a wrath drake'])
  assert.equal(hate.spawns, 7, "4 + 2 + 1, not the hatebone drake's 3 as well")
  assert.equal(hate.advances, 7)
  assert.deepEqual([hate.low, hate.high], [40, 48], "the kept mobs' levels only, not the drake's 60")
  assert.equal(hate.level, 43, 'the spawn-weighted average of 40, 42 and 45')
  assert.deepEqual(hate.targets, [DRAKES.id])
  assert.deepEqual(targetReach(zones).get(DRAKES.id), { zones: 1, spawns: 7 })
})

test('the switch for what is not open yet brings the flagged mobs back, zone and all', () => {
  const zones = planZones(HATE_MOBS, [DRAKES], EVERY_ERA)
  assert.deepEqual(zones.map((z) => z.short).sort(), ['fearplane', 'hateplane'])
  const hate = zones.find((z) => z.short === 'hateplane')
  assert.ok(hate)
  assert.equal(hate.mobs.length, 4)
  assert.equal(hate.spawns, 10)
  assert.deepEqual([hate.low, hate.high], [40, 60])
  assert.deepEqual(targetReach(zones).get(DRAKES.id), { zones: 2, spawns: 15 })
})

test('a catalog with no era flags plans exactly as before', () => {
  const unflagged = slayerMobs(
    HATE.map(({ outOfEra: _, ...rest }) => rest),
    () => undefined
  )
  assert.ok(unflagged.every((m) => !mobOutOfEra(m.entry) && keptMob(m, IN_ERA)))
  assert.deepEqual(
    planZones(unflagged, [DRAKES], IN_ERA).map((z) => [z.short, z.spawns, z.low, z.high]),
    [
      ['hateplane', 10, 40, 60],
      ['fearplane', 5, 58, 58]
    ]
  )
})

test('the map leaves out a flagged mob, as the zone list does', () => {
  const at = (name: string, [ns, ew]: [number, number], out = false): MobEntry => ({
    page: name,
    name,
    zones: ['Plane of Hate'],
    loc: [{ ns, ew }],
    ...(out ? { outOfEra: true as const } : {})
  })
  const field = slayerMobs(
    [at('a hatebone drake', [-134, 469], true), at('a hate drake', [-150, 480]), at('a wrath drake', [2000, 2000])],
    () => undefined
  )
  const listed = planZones(field, [DRAKES], IN_ERA).flatMap((z) => z.mobs.map((m) => m.name))
  const shaded = slayerAreas('hateplane', field, [DRAKES], IN_ERA)
  assert.deepEqual(shaded.flatMap((a) => a.mobs).sort(), [...listed].sort())
  assert.deepEqual(
    shaded.map((a) => [a.mobs, a.spawns]),
    [
      [['a wrath drake'], 1],
      [['a hate drake'], 1]
    ]
  )
  const every = slayerAreas('hateplane', field, [DRAKES], EVERY_ERA)
  assert.deepEqual(every.find((a) => a.mobs.includes('a hate drake'))?.spawns, 2)
  assert.equal(slayerAreas('hateplane', field, [DRAKES], NO_CAP).length, 2, 'NO_CAP draws every mob')
})

test("a named mob flagged out of era does not make its line work in the zone it's filed in", () => {
  const general = { category: 'EverQuest: Hunter', family: 'EverQuest', name: 'Hunter', achievements: [] }
  const line: BookComponent = { line: 'a hatebone drake', done: false }
  const drake = { name: 'Hate Hunter', done: false, components: [line] }
  const here = (out: boolean, outOfEra = false): ZoneHere => ({
    zone: 'hateplane',
    counters: new Set(),
    mobs: mobIndex([{ ...mob('a hatebone drake', 'Plane of Hate', ['60', 3], out), eraTag: 'FearHateRevamp' }]),
    outOfEra
  })
  assert.ok(!worksHere(general, drake, here(true)), 'a flagged mob in a classic zone')
  assert.ok(worksHere(general, drake, here(true, true)), 'the era switch brings it back')
  assert.ok(worksHere(general, drake, here(false)), 'no flag is in era, whatever the banner says')
})

// ---- THE PLAYER'S LOG OUTRANKS THE FLAG (owner ruling, 2026-10-17) --------------------------------
// A flagged mob the log shows was killed, conned or looted from is in era for this player. The
// evidence is module state (`shared/metInLog`), empty unless a test fills it; each test resets it.

test('a flagged mob the log met is offered again, in the zone list, the map and the zone filter', () => {
  setMet('mobs', ['A Hatebone Drake'])
  try {
    assert.equal(mobOutOfEra(HATE[0]), false, 'met in the log: in era, whatever the flag says')
    assert.equal(mobOutOfEra(HATE[4]), true, 'the fearbone drake was not met: still out')
    const zones = planZones(HATE_MOBS, [DRAKES], IN_ERA)
    assert.deepEqual(zones.map((z) => z.short), ['hateplane'])
    assert.equal(zones[0].mobs.length, 4, 'the hatebone drake is back in its zone')
    assert.equal(zones[0].spawns, 10)
    const field = slayerMobs([mob('a hatebone drake', 'Plane of Hate', ['60', 1], true)], () => undefined)
    assert.equal(slayerAreas('hateplane', field, [DRAKES], IN_ERA).length, 1, 'and shaded on the map')
    const general = { category: 'EverQuest: Hunter', family: 'EverQuest', name: 'Hunter', achievements: [] }
    const drake = { name: 'Hate Hunter', done: false, components: [{ line: 'a hatebone drake', done: false }] }
    const here: ZoneHere = { zone: 'hateplane', counters: new Set(), mobs: mobIndex([HATE[0]]), outOfEra: false }
    assert.ok(worksHere(general, drake, here), 'and its line works here again')
  } finally {
    setMet('mobs', [])
  }
  assert.equal(mobOutOfEra(HATE[0]), true, 'with the evidence gone the flag decides again')
})

test('the evidence version moves when the log meets something new, and only then', () => {
  const before = metVersion()
  setMet('mobs', ['a hatebone drake'])
  const after = metVersion()
  assert.notEqual(after, before, 'new evidence moves the version that keys the plan memos')
  setMet('mobs', ['A Hatebone Drake'])
  assert.equal(metVersion(), after, 'the same evidence again is no change')
  setMet('mobs', [])
  assert.notEqual(metVersion(), after)
})
