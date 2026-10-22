// The Gaps list grouped as a hunting plan (owner ask, 2026-10-18): zone, then mob, then what is missing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapGroupOrderOf, groupGaps, headingKeys, rowEntries, unfoldedEntries, withFolds, ZONE_NOT_SEEN, type GapEntry } from '../src/shared/gapGroups'
import type { GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'

const row = (domain: GapRow['domain'], name: string, zones: string[] = []): GapRow => ({
  domain,
  name,
  kinds: [],
  count: 1,
  first: '',
  last: '',
  details: { samples: [], ...(zones.length ? { zones: { entries: zones.map((z) => ({ name: z, n: 1 })), distinct: zones.length } } : {}) }
})

const shape = (entries: GapEntry[]): string[] =>
  entries.map((e) => (e.kind === 'zone' ? `# ${e.zone} (${String(e.n)})` : e.kind === 'mob' ? `  ${e.mob} (${String(e.n)})` : `    ${e.row.name}`))

test('items sit under each zone and mob that dropped them; zones and mobs A to Z, the zone-less last', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 2, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 3, item: 'Black Lizard Talon', source: 'a hatchling', zone: 'The Feerrott' },
    { ts: 4, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }
  ]
  const rows = [row('item', 'Black Lizard Talon'), row('item', 'Bone Chips'), row('item', 'Bought Thing', ['Freeport']), row('item', 'Nowhere')]
  assert.deepEqual(shape(groupGaps(rows, loot)), [
    '# Befallen (1)',
    '  a skeleton (1)',
    '    Bone Chips',
    '# Freeport (1)',
    '    Bought Thing',
    '# The Feerrott (1)',
    '  a hatchling (1)',
    '    Black Lizard Talon',
    '  a lizardman forager (1)',
    '    Black Lizard Talon',
    `# ${ZONE_NOT_SEEN} (1)`,
    '    Nowhere'
  ])
})

test('mobs sit under the zones they were seen in; ungrouped is the rows as they are', () => {
  const rows = [row('mob', 'Hoptor', ['Lower Guk']), row('mob', 'a gnoll', ['Blackburrow', 'Qeynos Hills'])]
  assert.deepEqual(shape(groupGaps(rows, [])), ['# Blackburrow (1)', '    a gnoll', '# Lower Guk (1)', '    Hoptor', '# Qeynos Hills (1)', '    a gnoll'])
  assert.deepEqual(rowEntries(rows).map((e) => e.key), ['mob|Hoptor', 'mob|a gnoll'])
  const keys = groupGaps(rows, []).map((e) => e.key)
  assert.equal(new Set(keys).size, keys.length, 'every entry has its own key')
})

test('a row under a mob sits one level deeper than a row directly under its zone', () => {
  const loot: LootEvent[] = [{ ts: 1, item: 'Spider Fang', source: 'a jungle spider', zone: 'The Feerrott' }]
  const entries = groupGaps([row('item', 'Spider Fang'), row('item', 'Bought Thing', ['The Feerrott'])], loot)
  assert.deepEqual(entries.map((e) => (e.kind === 'row' ? `${e.row.name}:${String(e.depth)}` : e.kind)), ['zone', 'Bought Thing:1', 'mob', 'Spider Fang:2'])
})

test('a folded zone shows only its heading; a folded mob hides its rows and nothing else', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Spider Fang', source: 'a jungle spider', zone: 'The Feerrott' },
    { ts: 2, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }
  ]
  const all = groupGaps([row('item', 'Spider Fang'), row('item', 'Bought Thing', ['The Feerrott']), row('item', 'Bone Chips')], loot)
  const names = (es: GapEntry[]): string[] => es.map((e) => (e.kind === 'row' ? e.row.name : e.kind === 'mob' ? e.mob : e.zone))
  const key = (n: string): string => all.find((e) => (e.kind === 'zone' ? e.zone : e.kind === 'mob' ? e.mob : '') === n)?.key ?? ''
  assert.deepEqual(names(unfoldedEntries(all, new Set([key('Befallen')]))), ['Befallen', 'The Feerrott', 'Bought Thing', 'a jungle spider', 'Spider Fang'])
  assert.deepEqual(names(unfoldedEntries(all, new Set([key('a jungle spider')]))), ['Befallen', 'a skeleton', 'Bone Chips', 'The Feerrott', 'Bought Thing', 'a jungle spider'])
})

test("a mob's page lines read A to Z under its heading, whatever the table's order (Copy lines copies them so)", () => {
  const drop = (item: string, n: number): GapRow => ({
    domain: 'drop',
    name: `${item} (a lesser kobold)`,
    kinds: ['looted'],
    count: n,
    first: '',
    last: '',
    details: { samples: [], sources: { entries: [{ name: 'a lesser kobold', n }], distinct: 1 }, zones: { entries: [{ name: 'Innothule Swamp', n }], distinct: 1, all: ['Innothule Swamp'] } }
  })
  const rows = [drop('Rusty Weapons', 2), drop('Small Box', 2), drop('Bandages', 1), drop('Belt Pouch', 1)]
  const mob = groupGaps(rows, []).find((e) => e.kind === 'mob')
  assert.ok(mob?.kind === 'mob')
  assert.deepEqual(mob.rows.map((r) => r.name), ['Bandages (a lesser kobold)', 'Belt Pouch (a lesser kobold)', 'Rusty Weapons (a lesser kobold)', 'Small Box (a lesser kobold)'])
})

test('the groups sort by how many are missing, most or fewest first, ties A to Z, the zone-less still last', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Fang', source: 'a spider', zone: 'The Feerrott' },
    { ts: 2, item: 'Claw', source: 'a lizard', zone: 'The Feerrott' },
    { ts: 3, item: 'Scale', source: 'a lizard', zone: 'The Feerrott' },
    { ts: 4, item: 'Bone', source: 'a skeleton', zone: 'Befallen' },
    { ts: 5, item: 'Fur', source: 'a gnoll', zone: 'Blackburrow' },
    { ts: 6, item: 'Ear', source: 'a gnoll', zone: 'Blackburrow' }
  ]
  const rows = ['Fang', 'Claw', 'Scale', 'Bone', 'Fur', 'Ear'].map((n) => row('item', n)).concat(row('item', 'Nowhere'))
  const heads = (es: GapEntry[]): string[] => shape(es).filter((l) => !l.startsWith('    '))
  assert.deepEqual(heads(groupGaps(rows, loot, undefined, 'most')), [
    '# The Feerrott (3)',
    '  a lizard (2)',
    '  a spider (1)',
    '# Blackburrow (2)',
    '  a gnoll (2)',
    '# Befallen (1)',
    '  a skeleton (1)',
    `# ${ZONE_NOT_SEEN} (1)`
  ])
  assert.deepEqual(heads(groupGaps(rows, loot, undefined, 'fewest')), [
    '# Befallen (1)',
    '  a skeleton (1)',
    '# Blackburrow (2)',
    '  a gnoll (2)',
    '# The Feerrott (3)',
    '  a spider (1)',
    '  a lizard (2)',
    `# ${ZONE_NOT_SEEN} (1)`
  ])
  assert.deepEqual(heads(groupGaps(rows, loot)), heads(groupGaps(rows, loot, undefined, 'name')), 'A to Z is the default')
  assert.equal(gapGroupOrderOf('most'), 'most')
  assert.equal(gapGroupOrderOf('garbage'), 'name')
  assert.equal(gapGroupOrderOf(null), 'name')
})

test('collapse all folds every heading, leaving the zones alone on screen', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Spider Fang', source: 'a jungle spider', zone: 'The Feerrott' },
    { ts: 2, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }
  ]
  const all = groupGaps([row('item', 'Spider Fang'), row('item', 'Bought Thing', ['The Feerrott']), row('item', 'Bone Chips')], loot)
  const keys = headingKeys(all)
  assert.equal(keys.length, 4)
  assert.deepEqual(unfoldedEntries(all, new Set(keys)).map((e) => e.kind), ['zone', 'zone'])
  assert.deepEqual(headingKeys(rowEntries([row('item', 'x')])), [], 'ungrouped has no headings')
})

test('the mobs fold at once while the zones stay as they are (owner ask, 2026-10-21)', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Spider Fang', source: 'a jungle spider', zone: 'The Feerrott' },
    { ts: 2, item: 'Lizard Scale', source: 'a lizardman scout', zone: 'The Feerrott' },
    { ts: 3, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }
  ]
  const all = groupGaps([row('item', 'Spider Fang'), row('item', 'Lizard Scale'), row('item', 'Bought Thing', ['The Feerrott']), row('item', 'Bone Chips')], loot)
  const mobs = headingKeys(all, 'mob')
  assert.equal(mobs.length, 3)
  assert.equal(headingKeys(all, 'zone').length, 2)
  // Befallen folded by hand stays folded; every mob folds, so the open zone shows its mobs alone.
  const befallen = 'zone|Befallen'
  const folded = withFolds(new Set([befallen]), mobs, true)
  assert.deepEqual(shape(unfoldedEntries(all, folded)), ['# Befallen (1)', '# The Feerrott (3)', '    Bought Thing', '  a jungle spider (1)', '  a lizardman scout (1)'])
  // Unfolding them gives the rows back and leaves Befallen folded.
  assert.deepEqual([...withFolds(folded, mobs, false)], [befallen])
})

test("Zone I'm in keeps the headings to the zone you stand in (owner, 2026-10-20)", () => {
  // A spell cast in two zones, with the player in one: one heading, not two.
  const rows = [row('spell', 'Summon Holy Steed Bridle', ['Butcherblock Mountains', 'New Sebilis Expedition']), row('spell', 'Summon Death Charger Bridle', ['New Sebilis Expedition'])]
  assert.deepEqual(shape(groupGaps(rows, [], undefined, { here: 'New Sebilis Expedition' })), [
    '# New Sebilis Expedition (2)',
    '    Summon Holy Steed Bridle',
    '    Summon Death Charger Bridle'
  ])
  // An item named here but looted elsewhere still files under here, not under the other zone.
  const loot: LootEvent[] = [{ ts: 1, item: 'Spider Fang', source: 'a spider', zone: 'The Feerrott' }]
  assert.deepEqual(shape(groupGaps([row('item', 'Spider Fang', ['Befallen'])], loot, undefined, { here: 'Befallen' })), ['# Befallen (1)', '    Spider Fang'])
  // Off, every zone it was seen in, as before.
  assert.equal(groupGaps(rows, []).filter((e) => e.kind === 'zone').length, 2)
})
