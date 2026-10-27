// THE EXALTATION CLEANUP OF 2026-10-26 (Malkil via the owner): only gems that can help the loadout
// are recommended, a locked gem stays where it is while the rest is re-solved, and the Recommended
// view's diff names what goes in and what comes out. What is pinned:
//
//   the spell list's focus rows decide who a focus helps (Resonance = BRD, Reanimation = a skeleton
//   pet class, a spell focus = a class with spells), and an unknown focus helps anyone;
//   a WAR/MNK/SHM loadout is offered no Resonance anywhere, a loadout with BRD is, and a Resonance
//   already socketed on WAR/MNK/SHM is called useless (red, and pulled in the plan);
//   a locked gem is never moved, replaced or flagged, its family is not seated twice, and the rest
//   of the board is solved around it;
//   the diff counts and names the added and removed gems seat by seat.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { OwnedExaltation } from '../src/shared/characterSheet'
import { COMMITTED_FOCUS_BENEFIT } from '../src/main/planner/focusBenefit'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { planBoard } from '../src/renderer/src/features/character/socketOptimize'
import { recommendSockets, type SocketHostCell } from '../src/renderer/src/features/character/socketRecommend'
import { boardDiff } from '../src/renderer/src/features/character/socketDiff'
import type { Loadout } from '../src/renderer/src/features/character/exaltationAudit'

const DRYWROUGHT: Loadout = { classes: ['WAR', 'MNK', 'SHM'], deity: null }
const BARD: Loadout = { classes: ['WAR', 'BRD', 'SHM'], deity: null }
const NOBODY: Loadout = { classes: [], deity: null }

const BRD_ONLY = { classes: ['BRD' as const], needs: 'BRD' }

interface RowSpec {
  key: string
  effects: GearRow['effects']
  slots: GearRow['slots']
}

function row({ key, effects, slots }: RowSpec): GearRow {
  return {
    key,
    name: key,
    searchKey: key,
    slots,
    classes: [],
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects
  }
}

const focus = (name: string, benefit?: typeof BRD_ONLY): GearRow['effects'] => [
  { name, kind: 'focus', ...(benefit === undefined ? {} : { benefit }) }
]

interface SeatSpec {
  cellId: string
  slot: SocketHostCell['slot']
  current?: string | null
  locked?: boolean
}

function seat({ cellId, slot, current = null, locked }: SeatSpec): SocketHostCell {
  return {
    cellId,
    cellLabel: cellId,
    item: 'Host',
    type: 'Focus',
    slot,
    itemKey: 'host',
    currentKey: current,
    currentName: current,
    ...(locked === undefined ? {} : { locked })
  }
}

const gem = (name: string, socketed = false): OwnedExaltation => ({
  name,
  key: name,
  where: socketed ? 'equipped' : 'your bank',
  socketed
})

// ---- who a focus helps: the committed spell list -----------------------------------------------

test('the spell list decides who a focus helps: bard instruments, skeleton pets, pets, spells', () => {
  for (const name of ['Brass Resonance 14', 'String Resonance 14', 'Wind Resonance 10', 'Percussion Resonance 11']) {
    assert.deepEqual(COMMITTED_FOCUS_BENEFIT(name)?.classes, ['BRD'], name)
  }
  // A tier the list files as NPC-only, or lacks, takes its family's rule.
  assert.deepEqual(COMMITTED_FOCUS_BENEFIT('Wind Resonance 8')?.classes, ['BRD'])
  assert.deepEqual(COMMITTED_FOCUS_BENEFIT('Brass Resonance 9')?.classes, ['BRD'])
  const skeleton = COMMITTED_FOCUS_BENEFIT('Reanimation Haste I')?.classes ?? []
  assert.ok(skeleton.includes('NEC') && skeleton.includes('SHD'), skeleton.join(','))
  assert.ok(!skeleton.includes('SHM'), 'a spirit wolf is not a skeleton pet')
  assert.ok(COMMITTED_FOCUS_BENEFIT('Summoning Haste III')?.classes.includes('SHM'), 'a shaman summons a pet')
  const caster = COMMITTED_FOCUS_BENEFIT('Mana Preservation II')?.classes ?? []
  for (const melee of ['WAR', 'MNK', 'BER'] as const) assert.ok(!caster.includes(melee), melee)
  assert.ok(caster.includes('SHM'))
  // No limit stated, or no row at all: no claim.
  assert.equal(COMMITTED_FOCUS_BENEFIT('See Invisible'), null)
  assert.equal(COMMITTED_FOCUS_BENEFIT('Minion of Air'), null)
})

test('the gear index carries it: McVaxius` Horn of War`s Brass Resonance helps BRD only', () => {
  const rows = buildGearIndex(itemsJson as unknown as ItemDbFile).rows
  const horn = rows.find((r) => r.name === 'McVaxius` Horn of War')
  assert.ok(horn !== undefined)
  assert.deepEqual(horn.effects.find((e) => e.name === 'Brass Resonance 14')?.benefit?.classes, ['BRD'])
})

// ---- the benefit filter in both engines ----------------------------------------------------------

const HORN = row({ key: 'horn', effects: focus('Brass Resonance 14', BRD_ONLY), slots: ['PRIMARY'] })
const MANA = row({ key: 'mana', effects: focus('Mana Preservation II'), slots: ['PRIMARY'] })

test('WAR/MNK/SHM is offered no Resonance; with BRD in the loadout it is', () => {
  const board = [seat({ cellId: 'primary', slot: 'PRIMARY' })]
  const owned = [gem('horn')]
  for (const [who, offered] of [
    [DRYWROUGHT, false],
    [BARD, true],
    [NOBODY, true]
  ] as const) {
    const recs = recommendSockets(owned, [HORN], who, board)
    const plan = planBoard(owned, [HORN], who, board)
    assert.equal(recs.fills.length > 0, offered, `fill for ${who.classes.join('/')}`)
    assert.equal(plan.placements.length > 0, offered, `plan for ${who.classes.join('/')}`)
    assert.equal(plan.contested.length, 0, 'a gem that helps nobody is not benched either')
  }
})

test('a Resonance already socketed on WAR/MNK/SHM is useless: red, replaced when it can be, pulled when not', () => {
  const owned = [gem('horn', true), gem('mana')]
  const board = [seat({ cellId: 'primary', slot: 'PRIMARY', current: 'horn' })]
  const recs = recommendSockets(owned, [HORN, MANA], DRYWROUGHT, board)
  assert.equal(recs.redundant.length, 1)
  assert.equal(recs.redundant[0].noBenefit, 'BRD')
  assert.equal(recs.redundant[0].replaceWith?.name, 'mana')
  assert.ok(recs.flaggedByCell.get('primary')?.has('horn'))
  const plan = planBoard(owned, [HORN, MANA], DRYWROUGHT, board)
  assert.deepEqual(plan.moves.map((m) => `${m.gemName}<${m.replacesName ?? ''}`), ['mana<horn'])
  // Nothing loose to put in: the plan pulls it and says why.
  const alone = planBoard([gem('horn', true)], [HORN], DRYWROUGHT, board)
  assert.deepEqual(alone.idle.map((i) => `${i.gemName}:${i.needs}`), ['horn:BRD'])
})

// ---- locks ---------------------------------------------------------------------------------------

test('a locked gem is never moved: the rest is re-solved around it and the loser is benched', () => {
  // Unlocked, Flexible (neck or waist) leaves the neck for Rigid (neck only): one move each.
  const flexible = row({ key: 'flexible', effects: focus('Effect A III'), slots: ['NECK', 'WAIST'] })
  const rigid = row({ key: 'rigid', effects: focus('Effect B III'), slots: ['NECK'] })
  const rows = [flexible, rigid]
  const owned = [gem('flexible', true), gem('rigid')]
  const board = (locked: boolean): SocketHostCell[] => [
    seat({ cellId: 'neck', slot: 'NECK', current: 'flexible', locked }),
    seat({ cellId: 'waist', slot: 'WAIST' })
  ]
  const free = planBoard(owned, rows, NOBODY, board(false))
  assert.equal(new Map(free.placements.map((p) => [p.gemName, p.cellId])).get('rigid'), 'neck')
  const held = planBoard(owned, rows, NOBODY, board(true))
  const at = new Map(held.placements.map((p) => [p.gemName, p.cellId]))
  assert.equal(at.get('flexible'), 'neck', 'the locked gem stays')
  assert.equal(at.get('rigid'), undefined)
  assert.equal(held.moves.length, 0)
  assert.equal(held.clears.length, 0)
  assert.equal(held.contested.length, 1)
  assert.match(held.contested[0].options[0].heldBy, /\(locked\)$/)
})

test('a lock pins the family at its tier: no copy that adds nothing elsewhere, no swap or flag over it', () => {
  const low = row({ key: 'low', effects: focus('Effect A I'), slots: ['NECK', 'WAIST'] })
  const twin = row({ key: 'twin', effects: focus('Effect A I'), slots: ['NECK', 'WAIST'] })
  const high = row({ key: 'high', effects: focus('Effect A III'), slots: ['NECK'] })
  const other = row({ key: 'other', effects: focus('Effect B II'), slots: ['WAIST'] })
  const rows = [low, twin, high, other]
  const owned = [gem('low', true), gem('twin'), gem('high'), gem('other')]
  const board = [seat({ cellId: 'neck', slot: 'NECK', current: 'low', locked: true }), seat({ cellId: 'waist', slot: 'WAIST' })]
  const plan = planBoard(owned, rows, NOBODY, board)
  assert.deepEqual(
    plan.placements.map((p) => `${p.cellId}:${p.gemName}`).sort(),
    ['neck:low', 'waist:other'],
    'the waist goes to another family, not to a second Effect A I'
  )
  const recs = recommendSockets(owned, rows, NOBODY, board)
  assert.equal(recs.swaps.length, 0, 'no upgrade offered over a lock (Effect A III is loose and fits the neck)')
  assert.equal(recs.flaggedByCell.get('neck'), undefined)
})

test('a lock on a lower tier never pulls the higher tier that outranks it', () => {
  // Affliction Efficiency I locked in an ear, II socketed in a wrist: the II stays where it is.
  const low = row({ key: 'low', effects: focus('Effect A I'), slots: ['EAR'] })
  const high = row({ key: 'high', effects: focus('Effect A II'), slots: ['WRIST'] })
  const owned = [gem('low', true), gem('high', true)]
  const board = [
    seat({ cellId: 'ear', slot: 'EAR', current: 'low', locked: true }),
    seat({ cellId: 'wrist', slot: 'WRIST', current: 'high' })
  ]
  const plan = planBoard(owned, [low, high], NOBODY, board)
  assert.deepEqual(plan.placements.map((p) => `${p.cellId}:${p.gemName}`).sort(), ['ear:low', 'wrist:high'])
  assert.equal(plan.moves.length + plan.clears.length, 0)
  assert.equal(boardDiff(plan, board, owned).bySeat.size, 0)
})

test('a locked gem that helps nobody stays, unflagged and unpulled', () => {
  const board = [seat({ cellId: 'primary', slot: 'PRIMARY', current: 'horn', locked: true })]
  const owned = [gem('horn', true), gem('mana')]
  const plan = planBoard(owned, [HORN, MANA], DRYWROUGHT, board)
  assert.deepEqual(plan.placements.map((p) => p.gemName), ['horn'])
  assert.equal(plan.idle.length, 0)
  assert.equal(plan.moves.length, 0)
  const recs = recommendSockets(owned, [HORN, MANA], DRYWROUGHT, board)
  assert.equal(recs.redundant.length, 0)
  assert.equal(recs.flaggedByCell.size, 0)
})

// ---- the Recommended view's diff -----------------------------------------------------------------

test('the diff names what comes out and what goes in, seat by seat', () => {
  const a = row({ key: 'a', effects: focus('Effect A III'), slots: ['NECK'] })
  const b = row({ key: 'b', effects: focus('Effect B III'), slots: ['WAIST'] })
  const owned = [gem('horn', true), gem('a'), gem('b'), gem('keep', true)]
  const keep = row({ key: 'keep', effects: focus('Effect K III'), slots: ['EAR'] })
  const hornNeck = row({ key: 'horn', effects: focus('Brass Resonance 14', BRD_ONLY), slots: ['NECK'] })
  const board = [
    seat({ cellId: 'neck', slot: 'NECK', current: 'horn' }),
    seat({ cellId: 'waist', slot: 'WAIST' }),
    seat({ cellId: 'ear', slot: 'EAR', current: 'keep' })
  ]
  const plan = planBoard(owned, [a, b, keep, hornNeck], DRYWROUGHT, board)
  const diff = boardDiff(plan, board, owned)
  assert.equal(diff.added, 2)
  assert.equal(diff.removed, 1)
  const neck = diff.bySeat.get('neck|Focus')
  assert.equal(neck?.current, 'horn')
  assert.equal(neck?.target, 'a')
  assert.equal(neck?.targetFrom, 'your bank')
  assert.equal(diff.bySeat.get('waist|Focus')?.current, null)
  assert.equal(diff.bySeat.get('waist|Focus')?.target, 'b')
  assert.equal(diff.bySeat.has('ear|Focus'), false, 'an unchanged seat is not a change')
  // With nothing loose for the neck, the horn is pulled (red alone), and the hover says why.
  const bare = planBoard([gem('horn', true)], [hornNeck], DRYWROUGHT, board.slice(0, 1))
  const pulled = boardDiff(bare, board.slice(0, 1), [gem('horn', true)]).bySeat.get('neck|Focus')
  assert.equal(pulled?.target, null)
  assert.equal(pulled?.why, 'It only helps BRD.')
})
